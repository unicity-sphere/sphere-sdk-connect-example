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

/** `data` crosses the wire from a peer on an SDK version this process does not control. */
function errorData(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const data = (err as { data?: unknown }).data;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function networkName(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'object' || value === null) return undefined;
  const bag = value as Record<string, unknown>;
  return text(bag.name) ?? (typeof bag.id === 'number' ? String(bag.id) : text(bag.id));
}

/** Discriminate on the CODE. The refusal text is a recommendation, not a contract. */
export function isWalletLocked(err: unknown): boolean {
  return connectErrorCode(err) === ERROR_CODES.WALLET_LOCKED;
}

/**
 * Turn a Connect failure into copy a human can act on.
 *
 * The handshake refusals are the ones worth unpacking: 4007 and 4008 both carry the numbers
 * that say WHAT to change in `error.data`, and a message that only repeats "incompatible"
 * sends a developer hunting. All three shapes are handled — the SDK floor (`requiredSdk` /
 * `actualSdk`), the protocol floor (`requiredProtocol` / `clientProtocol`) and the network
 * mismatch (`walletNetwork` / `clientNetwork`) — because a dApp that omits `network` hits the
 * last one on its very first connect.
 */
export function describeConnectFailure(err: unknown): string {
  const code = connectErrorCode(err);
  const message = err instanceof Error ? err.message : String(err);

  if (code === ERROR_CODES.WALLET_LOCKED) {
    return (
      'Wallet is locked (4009) — the session is still alive, so nothing needs reconnecting. ' +
      'Type "unlock" in the mock wallet server (or unlock the real wallet) and run the command again.'
    );
  }

  const data = errorData(err);
  if (data) {
    if (code === ERROR_CODES.INCOMPATIBLE_NETWORK) {
      const client = networkName(data.clientNetwork);
      const wallet = networkName(data.walletNetwork);
      if (client && wallet) return `This app targets network ${client}, but the wallet is on ${wallet}.`;
      if (wallet) return `This app declared no network — the wallet is on ${wallet}. Pass \`network\` to ConnectClient.`;
    }
    if (code === ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION) {
      const requiredSdk = text(data.requiredSdk);
      if (requiredSdk) {
        // `actualSdk` is the reported version string for any client on sphere-sdk >= 0.10.1;
        // null only for the two releases that predate the handshake field.
        const actualSdk = text(data.actualSdk);
        const has = actualSdk ? `is built on sphere-sdk ${actualSdk}` : 'reported no sphere-sdk version';
        return `This app ${has} — the wallet requires ${requiredSdk} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
      }
      const clientProtocol = text(data.clientProtocol);
      const requiredProtocol = text(data.requiredProtocol);
      if (clientProtocol && requiredProtocol) {
        return `This app speaks Connect protocol ${clientProtocol} — the wallet requires ${requiredProtocol} or newer.`;
      }
    }
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
