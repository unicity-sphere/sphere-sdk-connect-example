import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { describeError, isConnectErrorCode, isWalletLocked } from './errors';

const coded = (code: number, message = 'refused') => Object.assign(new Error(message), { code });

describe('isWalletLocked', () => {
  it('is true only for 4009', () => {
    expect(isWalletLocked(coded(ERROR_CODES.WALLET_LOCKED))).toBe(true);
    expect(isWalletLocked(coded(ERROR_CODES.USER_REJECTED))).toBe(false);
    expect(isWalletLocked(new Error('boom'))).toBe(false);
  });
});

describe('describeError', () => {
  it('explains a locked wallet without implying a disconnect', () => {
    const text = describeError(coded(ERROR_CODES.WALLET_LOCKED, 'Wallet is locked'));
    expect(text).toMatch(/locked/i);
    expect(text).toMatch(/still connected/i);
  });

  it('keeps the existing user-rejection copy', () => {
    expect(describeError(coded(ERROR_CODES.USER_REJECTED))).toBe(
      'You declined the signature request in your wallet.',
    );
  });

  it('treats a cancelled intent as a rejection too', () => {
    expect(describeError(coded(ERROR_CODES.INTENT_CANCELLED))).toBe(
      'You declined the signature request in your wallet.',
    );
  });

  it('falls back to the error message', () => {
    expect(describeError(new Error('Could not reach the backend'))).toBe('Could not reach the backend');
  });

  it('falls back to a generic line for a non-Error', () => {
    expect(describeError(null)).toBe('Something went wrong.');
  });
});

describe('isConnectErrorCode', () => {
  it('duck-types on a numeric code', () => {
    expect(isConnectErrorCode(coded(4003), 4003)).toBe(true);
    expect(isConnectErrorCode(undefined, 4003)).toBe(false);
  });

  it('ignores a string code — SphereError.code is a string', () => {
    expect(isConnectErrorCode({ code: 'USER_REJECTED' }, 4003)).toBe(false);
  });
});
