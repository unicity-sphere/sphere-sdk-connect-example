import { describe, it, expect } from 'vitest';
import { SPHERE_CONNECT_VERSION } from '@unicitylabs/sphere-sdk/connect';
import { minorOf, supportsGracefulLock } from './walletProtocol';

describe('minorOf', () => {
  it('reads the MINOR out of a MAJOR.MINOR string', () => {
    expect(minorOf('2.0')).toBe(0);
    expect(minorOf('2.1')).toBe(1);
    expect(minorOf('2.10')).toBe(10);
  });

  it('returns null for anything that is not MAJOR.MINOR', () => {
    expect(minorOf(null)).toBeNull();
    expect(minorOf(undefined)).toBeNull();
    expect(minorOf('2')).toBeNull();
    expect(minorOf('two.one')).toBeNull();
  });
});

describe('supportsGracefulLock', () => {
  // The SDK this dApp is built against must itself pass the check, or the reference
  // implementation would classify its own wallet as legacy.
  it('accepts the protocol version this SDK ships', () => {
    expect(supportsGracefulLock(SPHERE_CONNECT_VERSION)).toBe(true);
  });

  it('rejects a 2.0 wallet: its wallet:locked already revoked the session', () => {
    expect(supportsGracefulLock('2.0')).toBe(false);
  });

  it('treats an unknown protocol as legacy — never assume the session survives', () => {
    expect(supportsGracefulLock(null)).toBe(false);
    expect(supportsGracefulLock(undefined)).toBe(false);
    expect(supportsGracefulLock('nonsense')).toBe(false);
  });
});
