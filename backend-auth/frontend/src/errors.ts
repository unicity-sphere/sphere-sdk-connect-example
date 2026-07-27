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

export function describeError(err: unknown): string {
  if (isConnectErrorCode(err, ERROR_CODES.USER_REJECTED) || isConnectErrorCode(err, ERROR_CODES.INTENT_CANCELLED)) {
    return 'You declined the signature request in your wallet.';
  }
  if (isWalletLocked(err)) {
    return 'Your wallet is locked. Unlock it and press Sign in again — you are still connected, so no re-approval is needed.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
