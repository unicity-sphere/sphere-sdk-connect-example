import { describe, it, expect } from 'vitest';
import { interpretSendResult, SIMULATED_PENDING_RESULT } from './sendResult';

describe('interpretSendResult', () => {
  it('reads a normal delivered send', () => {
    expect(
      interpretSendResult({ success: true, transferId: 'abc123', status: 'completed', deliveryPending: false }),
    ).toEqual({ kind: 'delivered', transferId: 'abc123', status: 'completed' });
  });

  // CANARY: this is the exact shape the wallet sends for a certified-but-undelivered
  // spend (sphere useTransfer.ts returns { id: '', status: 'pending', deliveryPending: true },
  // and ConnectIntentHandler drops transferId because '' is falsy). If the wallet
  // contract drifts, this test must fail loudly — a silent drift here means dApps
  // start re-sending certified spends and double-paying.
  it('reads a delivery-pending send that carries NO transferId', () => {
    expect(interpretSendResult({ success: true, status: 'pending', deliveryPending: true })).toEqual({
      kind: 'delivery-pending',
      status: 'pending',
    });
  });

  it('treats deliveryPending as authoritative even if a transferId is present', () => {
    expect(
      interpretSendResult({ success: true, transferId: 'abc123', status: 'pending', deliveryPending: true }),
    ).toEqual({ kind: 'delivery-pending', status: 'pending' });
  });

  it('does not invent a delivered outcome when transferId is missing', () => {
    const raw = { success: true, status: 'completed', deliveryPending: false };
    expect(interpretSendResult(raw)).toEqual({ kind: 'unknown', raw });
  });

  it('survives a non-object result', () => {
    expect(interpretSendResult(null)).toEqual({ kind: 'unknown', raw: null });
  });

  it('ships a simulated pending fixture matching the real wire shape', () => {
    expect(interpretSendResult(SIMULATED_PENDING_RESULT)).toEqual({ kind: 'delivery-pending', status: 'pending' });
  });
});
