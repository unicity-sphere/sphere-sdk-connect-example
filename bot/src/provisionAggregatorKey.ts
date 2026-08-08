/**
 * Own-key provisioning from the aggregator-subscription gateway (SGW) — the
 * same challenge->sign->verify flow the Sphere wallet uses
 * (`sphere/src/services/subscriptionApi.ts` `provisionOrRecoverKey`), so the
 * bot can get its OWN per-wallet free-plan aggregator key instead of sharing
 * the static `AGGREGATOR_API_KEY` testnet2 key (and its rate limit) with
 * every other example wallet.
 *
 * SDK symbols verified against `@unicitylabs/sphere-sdk` **0.14.2** (the version
 * this package pins), all exported from the SDK root:
 * - `getPublicKey(privateKey, compressed?)` and `signMessage(privateKeyHex, message)`
 *   — pure local secp256k1 crypto; no aggregator key needed to run them, which is
 *   what makes the bootstrap (sign the challenge that provisions the key) possible.
 * - `NETWORKS` — `NETWORKS.testnet2.aggregatorUrl` is the SGW base URL
 *   (`https://gateway.testnet2.unicity.network`).
 * - `sphere.deriveAddress(0)` returns `AddressInfo`
 *   (`{ privateKey, publicKey, path, index }`).
 */
import type { Sphere } from '@unicitylabs/sphere-sdk';
import { getPublicKey, signMessage, NETWORKS } from '@unicitylabs/sphere-sdk';
import { verifySgwChallenge } from './sgwChallenge';

export interface ProvisionResult {
  apiKey: string;
  plan: string;
  created: boolean;
}

// Provisions (or recovers) THIS wallet's own free-plan aggregator key from the
// SGW — the same challenge->sign->verify flow the Sphere wallet uses
// (sphere/src/services/subscriptionApi.ts provisionOrRecoverKey). Idempotent
// get-or-create by the wallet's index-0 pubkey.
export async function provisionAggregatorKey(sphere: Sphere, network: string): Promise<ProvisionResult> {
  const base = (NETWORKS as Record<string, { aggregatorUrl: string }>)[network].aggregatorUrl;
  const { privateKey } = sphere.deriveAddress(0); // scope 'wallet' — stable identity
  const pubkey = getPublicKey(privateKey);

  const chRes = await fetch(`${base}/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey }),
  });
  if (!chRes.ok) throw new Error(`SGW /auth/challenge failed: ${chRes.status}`);
  const { nonce, challenge } = (await chRes.json()) as { nonce: string; challenge: string };

  verifySgwChallenge(challenge, { network, pubkey, nonce }); // never sign unverified text
  const signature = signMessage(privateKey, challenge); // signed VERBATIM

  const vRes = await fetch(`${base}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce, signature }),
  });
  if (!vRes.ok) {
    const body = (await vRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `SGW /auth/verify failed: ${vRes.status}`);
  }
  return (await vRes.json()) as ProvisionResult;
}
