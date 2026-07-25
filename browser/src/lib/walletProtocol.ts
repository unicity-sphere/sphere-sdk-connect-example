/**
 * What the wallet's Connect protocol version tells a dApp about `wallet:locked`.
 *
 * The event name did not change, its MEANING did:
 *   2.0 wallet — the removed ConnectHost.notifyWalletLocked() pushed wallet:locked AND
 *                revoked the session. There is nothing to wait for: wallet:unlocked will
 *                never arrive.
 *   2.1 wallet — ConnectHost.setLocked() pushes wallet:locked and PRESERVES the session.
 *                Requests answer WALLET_LOCKED (4009) until wallet:unlocked.
 *
 * This is the receiver for the 2.0 -> 2.1 MINOR bump. The compatibility gate itself compares
 * MAJOR only, so both wallets connect fine — only the lock semantics differ, and the client
 * learns which it is talking to from ConnectClient.walletProtocol (the `v` field the wallet
 * puts on every frame, captured at handshake time).
 */

/** The MINOR component of a `MAJOR.MINOR` protocol string, or null when it is not one. */
export function minorOf(version: string | null | undefined): number | null {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return Number(match[2]);
}

/**
 * True when the wallet preserves the session across a lock (Connect >= 2.1).
 *
 * An unknown or unparseable version is treated as LEGACY on purpose: assuming the session
 * survives when it does not leaves the dApp permanently stuck on a locked screen, waiting for
 * a wallet:unlocked that the wallet is not able to send.
 */
export function supportsGracefulLock(walletProtocol: string | null | undefined): boolean {
  const minor = minorOf(walletProtocol);
  return minor !== null && minor >= 1;
}
