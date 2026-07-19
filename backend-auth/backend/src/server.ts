/**
 * Backend-auth example server: authenticate a Sphere wallet by cryptographic
 * signature recovery — never by trusting a client-claimed identity.
 *
 * Flow:
 *  1. GET /challenge?chainPubkey=<66-hex>  — the frontend (Task 6) passes the
 *     connected wallet's chainPubkey so the challenge text binds to it. The
 *     server builds+stores a single-use challenge and returns it.
 *  2. The frontend asks the wallet (via Connect `sign_message`) to sign the
 *     returned `challenge` string verbatim.
 *  3. POST /verify { nonce, signature } — the server looks up the nonce,
 *     deletes it (single-use), reconstructs the *exact* challenge text from
 *     the stored fields, and recovers the signer's pubkey from the
 *     signature. Identity is keyed ONLY on that recovered pubkey — the
 *     chainPubkey passed to /challenge is a hint for challenge binding, not
 *     a trust input.
 *
 * Production nuance (see sphere-api/src/services/auth.service.ts): a real
 * deployment additionally resolves the recovered chainPubkey to a
 * directAddress/nametag via `sphere.resolve()` (Nostr binding lookup) and
 * keys the user record on that resolved directAddress instead of the raw
 * pubkey — resolution needs a full `Sphere.init()` (storage, transport,
 * oracle), which is out of scope for this thin example (see Task 7 notes).
 * This example stays intentionally thin and keys identity on the recovered
 * chainPubkey directly.
 */

import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { recoverPubkeyFromSignature, verifySignedMessage } from '@unicitylabs/sphere-sdk';
import { buildChallenge, reconstructChallenge, type ChallengeRecord } from './challenge.js';

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 7200);
const AUTH_DOMAIN = process.env.AUTH_DOMAIN ?? 'localhost';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

// 66 lowercase hex chars — the shape of a compressed secp256k1 pubkey. This
// is a cheap shape check on the binding *hint*, not a trust decision: /verify
// never trusts this value, only the pubkey it independently recovers from
// the signature.
const CHAIN_PUBKEY_RE = /^[0-9a-f]{66}$/;

const CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * In-memory nonce store, keyed by nonce → the fields needed to reconstruct
 * the exact challenge text. This is a demo store: single-process, no
 * persistence, no background eviction of expired-but-unused entries.
 *
 * Production replaces this with a TTL-indexed store (Redis / a DB collection
 * with an expiry index) shared across server instances, but keeps the same
 * two properties this example relies on: (1) single-use — deleted the
 * instant it's consumed by /verify, so a captured signature+nonce can't be
 * replayed; (2) expiring — /verify rejects a nonce whose expiresAt has
 * passed even if it's still present.
 */
const nonceStore = new Map<string, ChallengeRecord>();

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/challenge', (req: Request, res: Response) => {
  const chainPubkey = req.query.chainPubkey;

  if (typeof chainPubkey !== 'string' || !CHAIN_PUBKEY_RE.test(chainPubkey)) {
    res.status(400).json({
      error: 'chainPubkey must be a 66-char lowercase-hex compressed secp256k1 public key (02/03 prefix)',
    });
    return;
  }

  const nonce = nanoid(24);
  const built = buildChallenge({
    chainPubkey,
    domain: AUTH_DOMAIN,
    now: Date.now(),
    nonce,
    ttlSeconds: CHALLENGE_TTL_SECONDS,
  });

  nonceStore.set(nonce, {
    chainPubkey,
    domain: AUTH_DOMAIN,
    nonce: built.nonce,
    issuedAt: built.issuedAt,
    expiresAt: built.expiresAt,
  });

  res.json({ nonce: built.nonce, challenge: built.challenge, expiresAt: built.expiresAt });
});

app.post('/verify', (req: Request, res: Response) => {
  const { nonce, signature } = req.body ?? {};

  if (typeof nonce !== 'string' || typeof signature !== 'string') {
    res.status(400).json({ error: 'Body must include { nonce: string, signature: string }' });
    return;
  }

  // Single-use: look up AND delete atomically (synchronous — no other
  // request can interleave in Node's single-threaded event loop) so a
  // replayed (nonce, signature) pair can never verify twice.
  const stored = nonceStore.get(nonce);
  nonceStore.delete(nonce);

  if (!stored) {
    res.status(401).json({ error: 'Unknown or already-used nonce' });
    return;
  }

  if (Date.now() > stored.expiresAt) {
    res.status(401).json({ error: 'Challenge expired' });
    return;
  }

  // Reconstruct the EXACT string the wallet was asked to sign. Must go
  // through the same formatter buildChallenge used — see challenge.ts.
  const challenge = reconstructChallenge(stored);

  let recovered: string;
  try {
    recovered = recoverPubkeyFromSignature(challenge, signature);
  } catch (err) {
    res.status(401).json({ error: `Malformed signature: ${(err as Error).message}` });
    return;
  }

  // Sanity re-check: the recovered pubkey must actually verify against the
  // signature it was recovered from. (recoverPubkeyFromSignature already
  // guarantees this mathematically, but re-checking via the independent
  // verifySignedMessage path costs little and catches any future drift
  // between the two implementations.)
  if (!verifySignedMessage(challenge, signature, recovered)) {
    res.status(401).json({ error: 'Signature verification failed' });
    return;
  }

  // Identity is keyed ONLY on `recovered` — never on stored.chainPubkey
  // (the hint the frontend supplied to bind the challenge) and never on any
  // body-claimed identifier. This is the whole point of recovery-based auth.
  const expiresIn = SESSION_TTL_SECONDS;
  const token = jwt.sign({ sub: recovered }, JWT_SECRET, { expiresIn });

  res.json({ jwt: token, chainPubkey: recovered, expiresIn });
});

app.listen(PORT, () => {
  console.log(`backend-auth example listening on http://localhost:${PORT}`);
});
