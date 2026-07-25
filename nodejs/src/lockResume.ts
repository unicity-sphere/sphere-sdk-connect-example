/**
 * Lock helpers for the CLI dApp.
 *
 * Deliberately duplicated rather than shared with browser/src/lib/connectErrors.ts: each
 * example in this repo must be copy-pasteable on its own.
 */
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';

function connectErrorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

/** Discriminate on the CODE. The refusal text is a recommendation, not a contract. */
export function isWalletLocked(err: unknown): boolean {
  return connectErrorCode(err) === ERROR_CODES.WALLET_LOCKED;
}

export function describeConnectFailure(err: unknown): string {
  const code = connectErrorCode(err);
  const message = err instanceof Error ? err.message : String(err);

  if (code === ERROR_CODES.WALLET_LOCKED) {
    return (
      'Wallet is locked (4009) — the session is still alive, so nothing needs reconnecting. ' +
      'Type "unlock" in the mock wallet server (or unlock the real wallet) and run the command again.'
    );
  }
  if (code === undefined) return message;
  return `${message} (code ${code})`;
}

/**
 * Unlock is NOT implicitly the same wallet: the lock screen's "restore from recovery phrase"
 * installs a different seed while the approval that authorised this session is keyed on origin
 * alone. The host's own lock-edge guard revokes on a mismatch, but a dApp still compares so it
 * can render honestly and resume nothing it should not.
 */
export function isSameWallet(
  before: PublicIdentity | null,
  after: PublicIdentity | null | undefined,
): boolean {
  return !!before && !!after && before.chainPubkey === after.chainPubkey;
}
