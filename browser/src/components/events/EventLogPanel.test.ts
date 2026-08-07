import { describe, it, expect } from 'vitest';
import { AUTO_PUSHED_EVENTS } from '@unicitylabs/sphere-sdk/connect';
import { ALL_EVENTS, EVENT_COLORS, badgeFor } from './EventLogPanel';

describe('EventLogPanel event list', () => {
  // The host pushes these unconditionally. If the log omits one, the demo silently hides the
  // event that carries the whole lock model — and a future auto-pushed event cannot be
  // forgotten here either, because this asserts against the SDK's own list.
  it('logs every event the host pushes without a subscription', () => {
    for (const event of AUTO_PUSHED_EVENTS) {
      expect(ALL_EVENTS).toContain(event);
    }
  });

  it('lists no event twice', () => {
    expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
  });

  it('gives every listed event a badge colour', () => {
    for (const event of ALL_EVENTS) {
      expect(typeof EVENT_COLORS[event]).toBe('string');
    }
  });

  // The demo is teaching material: it must subscribe to the names a current wallet
  // actually emits. The pre-0.14 names still work through the host's compat adapter,
  // so a stale list fails silently — nothing here would break, the panel would just
  // quietly teach the wrong API. Pin both directions.
  it('uses the sphere-sdk 0.14 payments event names', () => {
    for (const event of [
      'transfer:incoming',
      'transfer:updated',
      'transfer:attention',
      'inventory:updated',
      'history:updated',
      'payment_request:incoming',
      'payment_request:updated',
      'connection:status',
    ]) {
      expect(ALL_EVENTS).toContain(event);
    }
  });

  it('lists no name the payments-v2 flip replaced', () => {
    for (const event of [
      'transfer:confirmed',
      'transfer:delivery_pending',
      'transfer:failed',
      'split:checkpoint-stuck',
      'delivery:undeliverable',
      'delivery:deferred',
      'sync:started',
      'sync:completed',
      'sync:provider',
      'sync:error',
      'sync:remote-update',
      'realtime:status',
      'storage:degraded',
      'payment_request:paid',
      'payment_request:rejected',
      'payment_request:expired',
      // Never existed in any SDK release — the old list carried them anyway.
      'payment_request:accepted',
      'payment_request:response',
    ]) {
      expect(ALL_EVENTS).not.toContain(event);
    }
  });
});

describe('badgeFor — transfer:updated is the COMBINED outcome event', () => {
  it('colours a FAILED transfer red, never the success green (the name alone lies)', () => {
    const failed = badgeFor('transfer:updated', { id: 't1', status: 'failed', error: 'insufficient balance' });
    expect(failed).toContain('red');
    expect(failed).not.toBe(EVENT_COLORS['transfer:updated']);
  });

  it('colours a still-converging transfer amber (deliveryPending or pending), not green', () => {
    expect(badgeFor('transfer:updated', { status: 'confirmed', deliveryPending: true })).toContain('amber');
    expect(badgeFor('transfer:updated', { status: 'pending' })).toContain('amber');
  });

  it('keeps the success colour for a delivered transfer and for every other event', () => {
    expect(badgeFor('transfer:updated', { status: 'delivered', deliveryPending: false }))
      .toBe(EVENT_COLORS['transfer:updated']);
    expect(badgeFor('transfer:incoming', {})).toBe(EVENT_COLORS['transfer:incoming']);
    expect(badgeFor('unknown:event', {})).toBe('bg-white/3 text-white/55');
  });

  it('does not crash on a null/undefined payload', () => {
    expect(badgeFor('transfer:updated', null)).toBe(EVENT_COLORS['transfer:updated']);
    expect(badgeFor('transfer:updated', undefined)).toBe(EVENT_COLORS['transfer:updated']);
  });
});
