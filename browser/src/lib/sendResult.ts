/**
 * The `send` intent result contract, as the Sphere wallet actually resolves it.
 *
 * Source of truth: sphere/src/components/connect/ConnectIntentHandler.tsx — the
 * wallet resolves { success, ...(id ? { transferId: id } : {}), status, deliveryPending }.
 * Connect itself does not type intent results (SphereIntentResult.result is
 * `unknown`), so this interface is a hand-maintained mirror. sendResult.test.ts
 * is the canary that fails if the wallet drifts away from it.
 */
export type TransferStatusWire =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'delivered'
  | 'completed'
  | 'failed';

export interface SendIntentResult {
  success: true;
  /**
   * OMITTED on a delivery-pending send: the wallet's TransferResult carries
   * id: '' in that case, and '' is falsy, so the field never reaches the dApp.
   */
  transferId?: string;
  status: TransferStatusWire;
  deliveryPending: boolean;
}

export type SendOutcome =
  | { kind: 'delivered'; transferId: string; status: TransferStatusWire }
  | { kind: 'delivery-pending'; status: TransferStatusWire }
  | { kind: 'unknown'; raw: unknown };

/**
 * Maps a raw `send` intent result to an outcome the UI can act on.
 *
 * MONEY SAFETY: `deliveryPending` wins over everything. It means the spend is
 * committed — or, on possibly-certified resolutions, may already be committed —
 * on-chain, and the SDK kept the intent open to settle it under the ORIGINAL
 * transferId. Re-issuing send() would consume a different source token and pay
 * twice. Never map this to a failure and never offer a retry for it.
 */
export function interpretSendResult(raw: unknown): SendOutcome {
  if (!raw || typeof raw !== 'object') return { kind: 'unknown', raw };

  const r = raw as Partial<SendIntentResult>;

  if (r.deliveryPending === true) {
    return { kind: 'delivery-pending', status: r.status ?? 'pending' };
  }

  if (typeof r.transferId === 'string' && r.transferId.length > 0) {
    return { kind: 'delivered', transferId: r.transferId, status: r.status ?? 'completed' };
  }

  return { kind: 'unknown', raw };
}

/**
 * DEMO SCAFFOLDING — not part of any real integration.
 *
 * A delivery-pending send cannot be triggered on demand (it depends on an
 * internal SDK condition), so the example ships this fixture to make the state
 * reachable and reviewable. Do NOT copy this into a real dApp.
 */
export const SIMULATED_PENDING_RESULT: SendIntentResult = {
  success: true,
  status: 'pending',
  deliveryPending: true,
};
