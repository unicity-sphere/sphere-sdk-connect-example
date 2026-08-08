import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { describeError, describeVersionFloor, isConnectErrorCode, isWalletLocked } from './errors';

const coded = (code: number, message = 'refused') => Object.assign(new Error(message), { code });
const codedWithData = (code: number, message: string, data: unknown) =>
  Object.assign(new Error(message), { code, data });

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

  it('names the required SDK version when the wallet enforces its floor', () => {
    const text = describeError(
      codedWithData(
        ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION,
        'SDK version unknown (not reported) is below the required minimum 0.14.1-0',
        { reason: 'protocol_incompatible', requiredSdk: '0.14.1-0', actualSdk: null },
      ),
    );
    expect(text).toContain('0.14.1-0');
    expect(text).toMatch(/reported no sphere-sdk version/);
  });

  it('falls back to the error message', () => {
    expect(describeError(new Error('Could not reach the backend'))).toBe('Could not reach the backend');
  });

  it('falls back to a generic line for a non-Error', () => {
    expect(describeError(null)).toBe('Something went wrong.');
  });
});

describe('describeVersionFloor', () => {
  it('is null for any other code', () => {
    expect(describeVersionFloor(coded(ERROR_CODES.USER_REJECTED))).toBeNull();
  });

  it('is null when the host sent no versions to name', () => {
    expect(
      describeVersionFloor(codedWithData(ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, 'nope', { reason: 'x' })),
    ).toBeNull();
  });

  it('names both versions when the host reported them', () => {
    expect(
      describeVersionFloor(
        codedWithData(ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, 'nope', {
          requiredSdk: '0.14.1-0',
          actualSdk: '0.13.1',
        }),
      ),
    ).toBe(
      'This app is built on sphere-sdk 0.13.1 — the wallet requires 0.14.1-0 or newer. ' +
        'Upgrade @unicitylabs/sphere-sdk and rebuild.',
    );
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
