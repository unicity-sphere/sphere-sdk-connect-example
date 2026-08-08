import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';

/** Connect intent/handshake errors carry a numeric `.code` (see ConnectError in
 *  @unicitylabs/sphere-sdk/connect). Duck-type on `.code` rather than `instanceof` —
 *  the SDK's own ConnectClient comment flags instanceof as unsafe across bundles. */
export function isConnectErrorCode(err: unknown, code: number): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === code;
}

export function isWalletLocked(err: unknown): boolean {
  return isConnectErrorCode(err, ERROR_CODES.WALLET_LOCKED);
}

/** A non-empty string field of an untrusted `data` bag, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * A wallet host on sphere-sdk >= 0.14.1 refuses any dApp built on an older SDK with
 * UNSUPPORTED_PROTOCOL_VERSION (4007), before any approval UI appears. It publishes the two
 * versions it compared in `error.data`, so say which version is needed rather than rendering
 * a bare "incompatible". Read defensively — `data` crosses postMessage from a peer on an SDK
 * version this app does not control.
 */
export function describeVersionFloor(err: unknown): string | null {
  if (!isConnectErrorCode(err, ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION)) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const bag = data as Record<string, unknown>;
  const requiredSdk = text(bag.requiredSdk);
  if (!requiredSdk) return null;
  const actualSdk = text(bag.actualSdk);
  const has = actualSdk ? `is built on sphere-sdk ${actualSdk}` : 'reported no sphere-sdk version';
  return `This app ${has} — the wallet requires ${requiredSdk} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
}

export function describeError(err: unknown): string {
  if (isConnectErrorCode(err, ERROR_CODES.USER_REJECTED) || isConnectErrorCode(err, ERROR_CODES.INTENT_CANCELLED)) {
    return 'You declined the signature request in your wallet.';
  }
  const versionFloor = describeVersionFloor(err);
  if (versionFloor) return versionFloor;
  if (isWalletLocked(err)) {
    return 'Your wallet is locked. Unlock it and press Sign in again — you are still connected, so no re-approval is needed.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
