/**
 * Sign-in challenge construction/reconstruction.
 *
 * THE central safety property of chainPubkey-recovery auth: the string the
 * backend feeds into `recoverPubkeyFromSignature` on /verify must be
 * byte-identical to the string the wallet actually signed on /challenge. If
 * it drifts by even one byte (whitespace, line-ending, field order, a
 * re-serialized number), `recoverPubkeyFromSignature` silently returns a
 * DIFFERENT-but-valid-looking pubkey — no error, wrong identity.
 *
 * To make that impossible, both directions go through the *same*
 * `formatChallenge` — build() calls it with freshly-generated fields,
 * reconstruct() calls it with the exact fields the server stored for the
 * nonce. There is no second place that assembles challenge text.
 *
 * `now` and `nonce` are injected (never `Date.now()`/`Math.random()` inside
 * these functions) so the pure logic here is deterministic and unit-testable
 * without faking globals.
 */

export interface ChallengeRecord {
  chainPubkey: string;
  domain: string;
  nonce: string;
  issuedAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

export interface BuildChallengeParams {
  chainPubkey: string;
  domain: string;
  now: number; // injected epoch ms ("current" time)
  nonce: string; // injected nonce (caller generates, e.g. via nanoid)
  ttlSeconds: number;
}

export interface BuiltChallenge {
  challenge: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * The single formatter. Both `buildChallenge` and `reconstructChallenge`
 * call this — never format challenge text anywhere else.
 */
function formatChallenge(fields: ChallengeRecord): string {
  return [
    'Sign in to the Sphere Connect example',
    '',
    `Domain: ${fields.domain}`,
    `Chain Pubkey: ${fields.chainPubkey}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${new Date(fields.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(fields.expiresAt).toISOString()}`,
  ].join('\n');
}

/** Builds a fresh challenge from injected `now`/`nonce`. */
export function buildChallenge(params: BuildChallengeParams): BuiltChallenge {
  const { chainPubkey, domain, now, nonce, ttlSeconds } = params;
  const issuedAt = now;
  const expiresAt = now + ttlSeconds * 1000;

  const challenge = formatChallenge({ chainPubkey, domain, nonce, issuedAt, expiresAt });

  return { challenge, nonce, issuedAt, expiresAt };
}

/**
 * Rebuilds the exact challenge string for a stored record (looked up by
 * nonce on /verify). Must never diverge from what `buildChallenge` produced
 * for the same fields — that's why both funnel through `formatChallenge`.
 */
export function reconstructChallenge(stored: ChallengeRecord): string {
  return formatChallenge(stored);
}
