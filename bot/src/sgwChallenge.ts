/**
 * SGW auth-challenge template validation — ported VERBATIM from the Sphere
 * wallet (`sphere/src/services/sgwChallenge.ts`). Self-contained, no sphere
 * deps. The wallet must never sign unverified server-chosen text (same rule
 * as the SDK's wallet-api verifyChallengeTemplate, ported for the SGW
 * prefix/format).
 * The challenge is still signed VERBATIM after validation — never re-serialize.
 */
export const SGW_CHALLENGE_PREFIX = 'unicity:sgw:auth:v1\n';

const MAX_VALIDITY_WINDOW_MS = 60 * 60_000;
const FIELDS = ['network', 'pubkey', 'nonce', 'issuedAt', 'expiresAt'] as const;

export class SgwChallengeError extends Error {
  constructor(message: string) {
    super(`SGW challenge rejected: ${message}`);
    this.name = 'SgwChallengeError';
  }
}

export function verifySgwChallenge(
  challenge: string,
  expect: { network: string; pubkey: string; nonce: string; nowMs?: number },
): void {
  if (!challenge.startsWith(SGW_CHALLENGE_PREFIX)) throw new SgwChallengeError('unexpected prefix');

  const body = challenge.slice(SGW_CHALLENGE_PREFIX.length);
  if (body.includes('\n')) throw new SgwChallengeError('payload must be single-line');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new SgwChallengeError('payload is not valid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SgwChallengeError('payload is not a JSON object');
  }
  for (const f of FIELDS) {
    if (typeof payload[f] !== 'string' || payload[f] === '') throw new SgwChallengeError(`missing field ${f}`);
  }

  const p = payload as Record<(typeof FIELDS)[number], string>;
  // Anti-cross-network relay: a challenge issued by ANOTHER network's SGW must
  // not be signable here. Key derivation + the signMessage scheme are
  // network-independent, so without this the wallet's index-0 signature over a
  // (say) mainnet challenge is redeemable at the mainnet SGW — a confused
  // deputy that harvests the victim's key on a network they never authenticated
  // to. The SDK's own verifyChallengeTemplate enforces the same equality.
  if (p.network.toLowerCase() !== expect.network.toLowerCase()) throw new SgwChallengeError('network mismatch');
  if (p.pubkey.toLowerCase() !== expect.pubkey.toLowerCase()) throw new SgwChallengeError('pubkey mismatch');
  if (p.nonce !== expect.nonce) throw new SgwChallengeError('nonce mismatch');

  const issuedAt = Date.parse(p.issuedAt);
  const expiresAt = Date.parse(p.expiresAt);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) throw new SgwChallengeError('unparseable timestamps');
  // Server timestamps only, compared against each other — never against the
  // local clock (sphere-sdk#662, and sphere PR #518 for this very file's
  // original). The challenge is fetched, verified and signed in one run, so in
  // the gateway's own time it is never stale, and the gateway enforces the
  // nonce TTL on its own clock when the signature comes back. A wrong local
  // clock would otherwise lock this bot out of the gateway permanently, with
  // the throw happening before the request that could have proved it fine.
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_VALIDITY_WINDOW_MS) {
    throw new SgwChallengeError('implausible validity window');
  }
}
