/**
 * Failure classification for Connect requests.
 *
 * Connect 2.1 makes this load-bearing. A locked wallet keeps the session, the granted
 * permissions and the transport alive and answers WALLET_LOCKED (4009); a dApp that tears
 * down on it orphans a host-side session that now survives, and the next silent autoConnect
 * reconnects with no prompt.
 *
 * Discriminate on the numeric `.code` — duck-typed, not `instanceof ConnectError`, which the
 * SDK's own client flags as unsafe across bundle copies. The refusal TEXT is never consulted
 * for a coded error: 'Wallet is locked' is a documented recommendation, not a wire contract.
 * Message text is used ONLY for the failures the SDK raises with no code at all.
 */
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import type { WalletLockedData } from '@unicitylabs/sphere-sdk/connect';

export type RequestErrorKind =
  /** WALLET_LOCKED (4009). Session alive. Show the lock, keep everything, let the caller retry. */
  | 'locked'
  /** The connection is genuinely gone. Drop client, transport and saved session id. */
  | 'teardown'
  /** A typed refusal the session survives (permission, rejection, rate limit, …). Surface it. */
  | 'other';

/** The numeric Connect error code carried by `err`, or undefined when it has none. */
export function connectErrorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

/**
 * The structured `data` the host attaches to every 4009 refusal.
 *
 * `SphereRpcError.data?` already existed and ConnectClient already forwards it into
 * ConnectError, so this is free. Release 1 always sends exactly `{ reason: 'locked' }`;
 * Release 2 adds `unlockSurface`, which is what feeds ConnectClientConfig.onWalletAttention.
 */
export function lockedData(err: unknown): WalletLockedData | undefined {
  if (connectErrorCode(err) !== ERROR_CODES.WALLET_LOCKED) return undefined;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  return (data as { reason?: unknown }).reason === 'locked' ? (data as WalletLockedData) : undefined;
}

/**
 * Codeless SDK failures that really do mean "the connection is gone":
 *   'Not connected'            — SphereError from ConnectClient.query/intent before a handshake
 *   'Query timeout: <method>'  — ConnectClient.query timer
 *   'Intent timeout: <action>' — ConnectClient.intent timer
 *   'Connection timeout'       — ConnectClient.connect timer
 *   'Disconnected'             — ConnectClient.cleanup() rejecting in-flight requests
 *   'Wallet popup was closed'  — this example's own ensureClient()
 *
 * Deliberately contains neither "session" nor a bare "closed": the regex this replaces matched
 * both, so any typed refusal that merely mentioned a session forced a full disconnect.
 */
const CODELESS_TEARDOWN =
  /\b(not connected|disconnected|connection timeout|query timeout|intent timeout|popup was closed)\b/i;

export function classifyRequestError(err: unknown): RequestErrorKind {
  const code = connectErrorCode(err);

  if (code !== undefined) {
    // A coded error is authoritative — never second-guess it with the message text.
    if (code === ERROR_CODES.WALLET_LOCKED) return 'locked';
    if (code === ERROR_CODES.NOT_CONNECTED || code === ERROR_CODES.SESSION_EXPIRED) return 'teardown';
    return 'other';
  }

  const message = err instanceof Error ? err.message : String(err);
  return CODELESS_TEARDOWN.test(message) ? 'teardown' : 'other';
}
