import { describe, it, expect } from 'vitest';
import { mockSphere } from './mockSphere';

/**
 * The mock is advertised as "shaped like a real wallet", and a ConnectHost is built around it.
 * Everything the host DEREFERENCES has to be present — a gap does not degrade gracefully, it
 * throws inside the host the first time the path is taken.
 *
 * Today `mockSphere.on` is a no-op, so the event-compat paths never run and a gap stays
 * invisible. These assertions are the thing that notices instead.
 */
describe('mockSphere implements what ConnectHost dereferences', () => {
  // The `paymentsV2` alias is GONE as of this SDK bump: `SphereInstance` declares `payments`
  // alone and no host path reads the old name. Keeping it would teach a field that no longer
  // exists, so this asserts its absence rather than its presence.
  it('exposes the facade as `payments`, with no deprecated paymentsV2 alias', () => {
    expect(mockSphere.payments).toBeDefined();
    expect('paymentsV2' in mockSphere).toBe(false);
  });

  // connect/host/payments-compat.ts reads `sphere.payments` (through its own try/catch helper)
  // for the payment_request:paid / :rejected / :expired adapters and for sync:completed.
  it.each(['assets', 'tokens', 'history', 'requests'])(
    'has facade member %s',
    (member) => {
      expect(mockSphere.payments[member as keyof typeof mockSphere.payments]).toBeDefined();
    },
  );

  it.each(['list', 'create', 'pay', 'decline', 'dismissProcessed'])(
    'has requests.%s',
    (member) => {
      const requests = mockSphere.payments.requests as Record<string, unknown>;
      expect(typeof requests[member]).toBe('function');
    },
  );

  it('survives the exact expression the payment_request compat adapter evaluates', () => {
    const update = { id: 'preq-001', status: 'paid' };
    expect(() =>
      mockSphere.payments.requests.list().find((request) => request.id === update.id),
    ).not.toThrow();
  });

  it('returns a listed request whose shape can rebuild the legacy payload', () => {
    const [view] = mockSphere.payments.requests.list();
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
