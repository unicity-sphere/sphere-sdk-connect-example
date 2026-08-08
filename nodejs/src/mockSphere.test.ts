import { describe, it, expect } from 'vitest';
import { mockSphere } from './mockSphere';

/**
 * The mock is advertised as "shaped like a real sphere-sdk 0.14 wallet", and a ConnectHost
 * is built around it. Everything the host DEREFERENCES has to be present — a gap does not
 * degrade gracefully, it throws inside the host the first time the path is taken.
 *
 * Today `mockSphere.on` is a no-op, so the event-compat paths never run and a gap stays
 * invisible. These assertions are the thing that notices instead.
 */
describe('mockSphere implements what ConnectHost dereferences', () => {
  it('exposes paymentsV2 as the same object as payments (the v2-wallet signal)', () => {
    expect(mockSphere.paymentsV2).toBe(mockSphere.payments);
  });

  // connect/host/payments-compat.ts: `sphere.paymentsV2?.requests.list()` for the
  // payment_request:paid / :rejected / :expired adapters, and `paymentsV2.tokens()`
  // for sync:completed. The optional chain guards `paymentsV2`, NOT `requests`.
  it.each(['assets', 'tokens', 'history', 'requests'])(
    'has facade member %s',
    (member) => {
      expect(mockSphere.paymentsV2[member as keyof typeof mockSphere.paymentsV2]).toBeDefined();
    },
  );

  it.each(['list', 'create', 'pay', 'decline', 'dismissProcessed'])(
    'has requests.%s',
    (member) => {
      const requests = mockSphere.paymentsV2.requests as Record<string, unknown>;
      expect(typeof requests[member]).toBe('function');
    },
  );

  it('survives the exact expression the payment_request compat adapter evaluates', () => {
    const update = { id: 'preq-001', status: 'paid' };
    expect(() =>
      mockSphere.paymentsV2?.requests.list().find((request) => request.id === update.id),
    ).not.toThrow();
  });

  it('returns a listed request whose shape can rebuild the legacy payload', () => {
    const [view] = mockSphere.paymentsV2.requests.list();
    for (const field of ['id', 'requestId', 'senderPubkey', 'amount', 'coinId', 'timestamp', 'status']) {
      expect(view).toHaveProperty(field);
    }
  });

  it('has the non-payments members the host reads', () => {
    expect(mockSphere.identity.chainPubkey).toBeTruthy();
    expect(typeof mockSphere.resolve).toBe('function');
    expect(typeof mockSphere.on).toBe('function');
    expect(typeof mockSphere.communications.getConversations).toBe('function');
  });
});
