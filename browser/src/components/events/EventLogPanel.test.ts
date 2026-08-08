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
  // actually emits. A stale list fails silently either way — the 16 names the host's
  // COMPAT_ATTACHERS covers keep arriving through the adapter, and the other 26 are
  // accepted by `subscribe` and then never fire. Neither breaks anything here; the
  // panel would just quietly teach the wrong API. Pin both directions.
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
      // Both WERE real in 0.13.1 (declared in SphereEventType/SphereEventMap;
      // `:response` is emitted by PaymentsModule). The flip removed them and gave
      // them no compat attacher, so unlike the names above they do not come back.
      'payment_request:accepted',
      'payment_request:response',
    ]) {
      expect(ALL_EVENTS).not.toContain(event);
    }
  });

  // The 26 pre-0.14 names with no COMPAT_ATTACHERS entry are the dangerous ones: a
  // subscription is ACCEPTED and then silently never fires, so listing one here would
  // look like a working demo of an event that can no longer arrive. Whole families went
  // this way — every `invoice:*` and every `swap:*`.
  it('lists no pre-0.14 name the compat adapter does not re-emit', () => {
    for (const event of [
      'invoice:created',
      'invoice:payment',
      'invoice:covered',
      'invoice:closed',
      'invoice:overpayment',
      'invoice:expired',
      'invoice:cancelled',
      'invoice:irrelevant',
      'swap:proposed',
      'swap:accepted',
      'swap:rejected',
      'swap:cancelled',
      'swap:concluding',
      'swap:completed',
      'swap:failed',
      'swap:announced',
      'inventory:conflict',
      'send:partial-remainder',
      'transfer:invalid',
      'walletapi:session',
      'payment_request:settling',
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

  // `submitted` is certification IN FLIGHT — the money has not settled. It is the one
  // status a blocklist implementation gets wrong, because it is neither 'failed' nor
  // 'pending' and so falls through to the success colour.
  it('colours a SUBMITTED transfer amber — it has not settled yet', () => {
    expect(badgeFor('transfer:updated', { status: 'submitted' })).toContain('amber');
  });

  // Green must be earned, not defaulted into: a payload with no status has told us
  // nothing about the outcome, so it cannot answer "did it go through?" with yes.
  it('does not paint an outcome-less payload green', () => {
    expect(badgeFor('transfer:updated', {})).toContain('amber');
    expect(badgeFor('transfer:updated', { status: 'something-new' })).toContain('amber');
  });

  it('keeps the success colour only for a settled transfer, and for every other event', () => {
    for (const status of ['confirmed', 'delivered', 'completed']) {
      expect(badgeFor('transfer:updated', { status, deliveryPending: false }))
        .toBe(EVENT_COLORS['transfer:updated']);
    }
    expect(badgeFor('transfer:incoming', {})).toBe(EVENT_COLORS['transfer:incoming']);
    expect(badgeFor('unknown:event', {})).toBe('bg-white/3 text-white/55');
  });

  it('does not crash on a null/undefined payload', () => {
    expect(badgeFor('transfer:updated', null)).toContain('amber');
    expect(badgeFor('transfer:updated', undefined)).toContain('amber');
  });
});
