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

/** A network as `error.data` carries it: `{ id, name }`, a bare id, or nothing. */
function networkName(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'object' || value === null) return null;
  const bag = value as Record<string, unknown>;
  return text(bag.name) ?? (typeof bag.id === 'number' ? String(bag.id) : text(bag.id));
}

/**
 * A refused handshake, turned into copy that names what to change.
 *
 * There are THREE shapes behind the two codes, and handling only one leaves the others
 * rendering a bare message that names nothing:
 *   4007 + requiredSdk/actualSdk           — the SDK floor
 *   4007 + requiredProtocol/clientProtocol — the Connect protocol floor
 *   4008 + walletNetwork/clientNetwork     — a network mismatch, which is what a dApp
 *                                            that omits `network` hits on first connect
 *
 * Read defensively — `data` crosses postMessage from a peer on an SDK version this app
 * does not control.
 */
export function describeHandshakeRefusal(err: unknown): string | null {
  const isVersion = isConnectErrorCode(err, ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION);
  const isNetwork = isConnectErrorCode(err, ERROR_CODES.INCOMPATIBLE_NETWORK);
  if (!isVersion && !isNetwork) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const bag = data as Record<string, unknown>;

  if (isNetwork) {
    const wallet = networkName(bag.walletNetwork);
    if (!wallet) return null;
    const client = networkName(bag.clientNetwork);
    return client
      ? `This app targets network ${client}, but the wallet is on ${wallet}.`
      : `This app declared no network — the wallet is on ${wallet}. Pass \`network\` to ConnectClient.`;
  }

  const requiredSdk = text(bag.requiredSdk);
  if (requiredSdk) {
    // `actualSdk` is a version STRING for any client on sphere-sdk >= 0.10.1; it is null
    // only for 0.9.x / 0.10.0, the releases predating the handshake's sdkVersion field.
    const actualSdk = text(bag.actualSdk);
    const has = actualSdk ? `is built on sphere-sdk ${actualSdk}` : 'reported no sphere-sdk version';
    return `This app ${has} — the wallet requires ${requiredSdk} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
  }

  const clientProtocol = text(bag.clientProtocol);
  const requiredProtocol = text(bag.requiredProtocol);
  if (clientProtocol && requiredProtocol) {
    return `This app speaks Connect protocol ${clientProtocol} — the wallet requires ${requiredProtocol} or newer. Upgrade @unicitylabs/sphere-sdk and rebuild.`;
  }

  return null;
}

export function describeError(err: unknown): string {
  if (isConnectErrorCode(err, ERROR_CODES.USER_REJECTED) || isConnectErrorCode(err, ERROR_CODES.INTENT_CANCELLED)) {
    return 'You declined the signature request in your wallet.';
  }
  const refusal = describeHandshakeRefusal(err);
  if (refusal) return refusal;
  if (isWalletLocked(err)) {
    return 'Your wallet is locked. Unlock it and press Sign in again — you are still connected, so no re-approval is needed.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
