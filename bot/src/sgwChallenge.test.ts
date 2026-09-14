import { describe, expect, it } from 'vitest';
import { SGW_CHALLENGE_PREFIX, SgwChallengeError, verifySgwChallenge } from './sgwChallenge';

const NETWORK = 'testnet2';
const PUBKEY = '02'.padEnd(66, 'a'); // 33-byte compressed pubkey shape, not cryptographically real
const NONCE = 'nonce-123';
const NOW = Date.parse('2026-07-19T12:00:00.000Z');

function buildChallenge(overrides: Partial<Record<'network' | 'pubkey' | 'nonce' | 'issuedAt' | 'expiresAt', string>> = {}) {
  const body = {
    network: NETWORK,
    pubkey: PUBKEY,
    nonce: NONCE,
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
    ...overrides,
  };
  return SGW_CHALLENGE_PREFIX + JSON.stringify(body);
}

const expect_ = { network: NETWORK, pubkey: PUBKEY, nonce: NONCE, nowMs: NOW };

describe('verifySgwChallenge', () => {
  it('accepts a valid challenge', () => {
    expect(() => verifySgwChallenge(buildChallenge(), expect_)).not.toThrow();
  });

  it('rejects the wrong prefix', () => {
    const challenge = 'unicity:sgw:auth:v2\n' + buildChallenge().slice(SGW_CHALLENGE_PREFIX.length);
    expect(() => verifySgwChallenge(challenge, expect_)).toThrow(SgwChallengeError);
  });

  it('rejects a network mismatch', () => {
    expect(() => verifySgwChallenge(buildChallenge({ network: 'mainnet' }), expect_)).toThrow(SgwChallengeError);
  });

  it('rejects a pubkey mismatch', () => {
    expect(() => verifySgwChallenge(buildChallenge({ pubkey: '03' + PUBKEY.slice(2) }), expect_)).toThrow(
      SgwChallengeError,
    );
  });

  it('rejects a nonce mismatch', () => {
    expect(() => verifySgwChallenge(buildChallenge({ nonce: 'other-nonce' }), expect_)).toThrow(SgwChallengeError);
  });

  it('rejects a validity window that ends before it starts', () => {
    const challenge = buildChallenge({
      issuedAt: new Date(NOW + 10 * 60_000).toISOString(),
      expiresAt: new Date(NOW).toISOString(),
    });
    expect(() => verifySgwChallenge(challenge, expect_)).toThrow(SgwChallengeError);
  });

  it('rejects a validity window longer than 60 minutes', () => {
    const challenge = buildChallenge({
      issuedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 61 * 60_000).toISOString(),
    });
    expect(() => verifySgwChallenge(challenge, expect_)).toThrow(SgwChallengeError);
  });

  it('rejects a multi-line body', () => {
    const challenge = SGW_CHALLENGE_PREFIX + JSON.stringify({ network: NETWORK, pubkey: PUBKEY, nonce: NONCE, issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 60_000).toISOString() }) + '\nextra';
    expect(() => verifySgwChallenge(challenge, expect_)).toThrow(SgwChallengeError);
  });
});

/**
 * The local clock is not evidence about a server-issued challenge.
 *
 * The wallet this file is copied from locked out every user whose clock had
 * drifted more than five minutes: no subscription key, no sending, for weeks
 * (Discord support, Aug-Sep 2026). sphere-sdk had already reached the same
 * conclusion from ~63 production Sentry events and deleted the comparison
 * (unicity-sphere/sphere-sdk#662). A host with a wrong clock is rarer here
 * than in a browser, but the reasoning is the same: the gateway enforces the
 * nonce TTL on its own clock, and the prefix/network/pubkey/nonce binding is
 * what makes the text safe to sign.
 */
describe('verifySgwChallenge ignores the local clock', () => {
  it('accepts a challenge stamped ahead of the local clock', () => {
    const behind = { ...expect_, nowMs: NOW - 12 * 60_000 };
    expect(() => verifySgwChallenge(buildChallenge(), behind)).not.toThrow();
  });

  it('accepts a challenge the local clock believes has already expired', () => {
    const ahead = { ...expect_, nowMs: NOW + 30 * 60_000 };
    expect(() => verifySgwChallenge(buildChallenge(), ahead)).not.toThrow();
  });

  it('still refuses a challenge bound to another key, whatever the clock says', () => {
    const behind = { ...expect_, nowMs: NOW - 12 * 60_000 };
    expect(() => verifySgwChallenge(buildChallenge({ pubkey: '03' + PUBKEY.slice(2) }), behind)).toThrow(
      SgwChallengeError,
    );
  });
});
