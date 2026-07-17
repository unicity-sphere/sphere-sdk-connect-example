import { describe, expect, it } from 'vitest';
import { buildChallenge, reconstructChallenge } from './challenge';

// Deterministic fixtures — never Date.now()/Math.random() in the functions
// under test, so these values are injected explicitly.
const CHAIN_PUBKEY = '02' + 'a'.repeat(64);
const DOMAIN = 'localhost';
const NOW = 1_700_000_000_000; // fixed epoch ms
const NONCE = 'nonce-fixed-0001';
const TTL_SECONDS = 300;

describe('buildChallenge', () => {
  it('returns a multi-line challenge containing nonce, issuedAt, expiresAt, domain, and chainPubkey', () => {
    const { challenge, nonce, issuedAt, expiresAt } = buildChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      now: NOW,
      nonce: NONCE,
      ttlSeconds: TTL_SECONDS,
    });

    expect(nonce).toBe(NONCE);
    expect(issuedAt).toBe(NOW);
    expect(expiresAt).toBe(NOW + TTL_SECONDS * 1000);

    expect(challenge).toContain(NONCE);
    expect(challenge).toContain(DOMAIN);
    expect(challenge).toContain(CHAIN_PUBKEY);
    expect(challenge).toContain(new Date(issuedAt).toISOString());
    expect(challenge).toContain(new Date(expiresAt).toISOString());
    expect(challenge.split('\n').length).toBeGreaterThan(1);
  });

  it('produces different challenges for different nonces (same everything else)', () => {
    const a = buildChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      now: NOW,
      nonce: 'nonce-aaaa',
      ttlSeconds: TTL_SECONDS,
    });
    const b = buildChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      now: NOW,
      nonce: 'nonce-bbbb',
      ttlSeconds: TTL_SECONDS,
    });

    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe('reconstructChallenge', () => {
  it('is byte-identical to the original buildChallenge output — the whole safety property', () => {
    const built = buildChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      now: NOW,
      nonce: NONCE,
      ttlSeconds: TTL_SECONDS,
    });

    // Simulate what the server stores keyed by nonce, then reconstructs on /verify.
    const stored = {
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      nonce: built.nonce,
      issuedAt: built.issuedAt,
      expiresAt: built.expiresAt,
    };

    const reconstructed = reconstructChallenge(stored);

    expect(reconstructed).toBe(built.challenge);
    // Belt-and-braces: exact byte length match too, not just string equality
    // semantics — guards against any hidden normalization difference.
    expect(reconstructed.length).toBe(built.challenge.length);
  });

  it('reconstructs a different string when any stored field differs (drift is detectable)', () => {
    const built = buildChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      now: NOW,
      nonce: NONCE,
      ttlSeconds: TTL_SECONDS,
    });

    const wrongNonce = reconstructChallenge({
      chainPubkey: CHAIN_PUBKEY,
      domain: DOMAIN,
      nonce: 'different-nonce',
      issuedAt: built.issuedAt,
      expiresAt: built.expiresAt,
    });

    expect(wrongNonce).not.toBe(built.challenge);
  });
});
