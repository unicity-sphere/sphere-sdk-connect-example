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
  /**
   * INTENT_OUTCOME_UNKNOWN (4201). The wallet took the intent and the answer was lost — a host
   * deadline, a lock, a logout. **The money may or may not have moved.**
   *
   * Kept apart from 'other' precisely so a UI cannot treat it as an ordinary refusal: the
   * natural reaction to "failed" is to re-enable the button, and that is the one thing that
   * must not happen here. Reconcile out of band — poll the recipient, your backend, the
   * aggregator — and only then decide.
   */
  | 'outcome-unknown'
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

/** A non-empty string field of an untrusted `data` bag, or null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `mainnet (1)` / `network 4`, or null when the peer sent no usable descriptor. */
function describeNetwork(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name } = value as { id?: unknown; name?: unknown };
  if (typeof id !== 'number') return null;
  const label = text(name);
  return label ? `${label} (${id})` : `network ${id}`;
}

/**
 * Connect-screen copy for a failed handshake.
 *
 * The compatibility gate publishes the versions it compared in `error.data` —
 * `requiredSdk`/`actualSdk` for the npm floor, `clientProtocol`/`requiredProtocol` for the
 * protocol floor, `clientNetwork`/`walletNetwork` for the network check. A wallet on an older
 * SDK sends a `message` that names NONE of them ("SDK version below the required minimum"),
 * so rendering `err.message` alone tells a developer to upgrade without saying to what.
 * Read `data` and say it. When the gate sent no versions the wallet's own message is already
 * the best available text — pass it through rather than inventing worse copy.
 *
 * Every field is read defensively: `data` crosses postMessage from a peer on an SDK version
 * this app does not control.
 */
export function describeConnectFailure(err: unknown): string {
  const code = connectErrorCode(err);
  const raw = err instanceof Error ? err.message : null;
  const fallback = raw ?? 'Connection failed';

  if (code !== ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION && code !== ERROR_CODES.INCOMPATIBLE_NETWORK) {
    return fallback;
  }

  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return fallback;
  const bag = data as Record<string, unknown>;

  if (code === ERROR_CODES.INCOMPATIBLE_NETWORK) {
    const client = describeNetwork(bag.clientNetwork);
    const wallet = describeNetwork(bag.walletNetwork);
    return client && wallet
      ? `This app targets ${client}, but the wallet is on ${wallet}.`
      : fallback;
  }

  const requiredSdk = text(bag.requiredSdk);
  if (requiredSdk) {
    const actualSdk = text(bag.actualSdk);
    const has = actualSdk ? `is built on sphere-sdk ${actualSdk}` : 'reported no sphere-sdk version';
    return `This app ${has} — the wallet requires ${requiredSdk} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
  }

  const clientProtocol = text(bag.clientProtocol);
  const requiredProtocol = text(bag.requiredProtocol);
  if (clientProtocol && requiredProtocol) {
    return `This app speaks Connect protocol ${clientProtocol} — the wallet requires ${requiredProtocol} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
  }

  return fallback;
}

export function classifyRequestError(err: unknown): RequestErrorKind {
  const code = connectErrorCode(err);

  if (code !== undefined) {
    // A coded error is authoritative — never second-guess it with the message text.
    if (code === ERROR_CODES.WALLET_LOCKED) return 'locked';
    if (code === ERROR_CODES.INTENT_OUTCOME_UNKNOWN) return 'outcome-unknown';
    if (code === ERROR_CODES.NOT_CONNECTED || code === ERROR_CODES.SESSION_EXPIRED) return 'teardown';
    return 'other';
  }

  const message = err instanceof Error ? err.message : String(err);
  return CODELESS_TEARDOWN.test(message) ? 'teardown' : 'other';
}
