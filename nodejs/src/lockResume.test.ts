import { describe, it, expect } from 'vitest';
import { ConnectError, ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import { describeConnectFailure, isSameWallet, isWalletLocked } from './lockResume';

const alice: PublicIdentity = { chainPubkey: '02aaaa', nametag: 'alice' };
const mallory: PublicIdentity = { chainPubkey: '02bbbb', nametag: 'mallory' };
const locked = () => new ConnectError('Wallet is locked', ERROR_CODES.WALLET_LOCKED, { reason: 'locked' });

describe('isWalletLocked', () => {
  it('recognises 4009 and nothing else, whatever the text says', () => {
    expect(isWalletLocked(locked())).toBe(true);
    expect(isWalletLocked(new ConnectError('Gesperrt', ERROR_CODES.WALLET_LOCKED))).toBe(true);
    expect(isWalletLocked(new ConnectError('Not connected', ERROR_CODES.NOT_CONNECTED))).toBe(false);
    expect(isWalletLocked(new Error('Query timeout: sphere_getBalance'))).toBe(false);
  });
});

describe('describeConnectFailure', () => {
  it('tells a headless operator what a lock means and how to clear it', () => {
    const text = describeConnectFailure(locked());
    expect(text).toContain('4009');
    expect(text).toContain('session is still alive');
    expect(text).toContain('unlock');
  });

  it('keeps the code visible on other typed refusals', () => {
    expect(describeConnectFailure(new ConnectError('Permission denied', ERROR_CODES.PERMISSION_DENIED))).toBe(
      'Permission denied (code 4002)',
    );
  });

  it('passes a codeless error through unchanged', () => {
    expect(describeConnectFailure(new Error('Query timeout: sphere_getBalance'))).toBe(
      'Query timeout: sphere_getBalance',
    );
  });
});

describe('isSameWallet', () => {
  it('compares chainPubkey and treats a missing identity as different', () => {
    expect(isSameWallet(alice, alice)).toBe(true);
    expect(isSameWallet(alice, mallory)).toBe(false);
    expect(isSameWallet(alice, null)).toBe(false);
    expect(isSameWallet(alice, undefined)).toBe(false);
    expect(isSameWallet(null, alice)).toBe(false);
  });
});
