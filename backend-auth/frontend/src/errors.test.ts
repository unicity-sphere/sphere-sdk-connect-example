import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { describeError, describeHandshakeRefusal, isConnectErrorCode, isWalletLocked } from './errors';

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

  // The refusal a real pre-flip dApp receives: `ConnectClient` has reported its version
  // since sphere-sdk 0.10.1, so the wallet names it. This is the reachable case.
  it('names both SDK versions when the wallet enforces its floor', () => {
    const text = describeError(
      codedWithData(
        ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION,
        'SDK version 0.13.1 is below the required minimum 0.14.1-0',
        { reason: 'protocol_incompatible', requiredSdk: '0.14.1-0', actualSdk: '0.13.1' },
      ),
    );
    expect(text).toContain('0.14.1-0');
    expect(text).toContain('0.13.1');
  });

  // `actualSdk: null` reaches a host only from 0.9.x / 0.10.0, which predate the
  // handshake's sdkVersion field. Still handled — just not the common case.
  it('says so when the client reported no version at all', () => {
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

describe('describeHandshakeRefusal', () => {
  it('is null for any other code', () => {
    expect(describeHandshakeRefusal(coded(ERROR_CODES.USER_REJECTED))).toBeNull();
  });

  it('is null when the host sent no versions to name', () => {
    expect(
      describeHandshakeRefusal(codedWithData(ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, 'nope', { reason: 'x' })),
    ).toBeNull();
  });

  it('names both versions when the host reported them', () => {
    expect(
      describeHandshakeRefusal(
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

  // A protocol-floor 4007 carries no requiredSdk — a describer written for the SDK branch
  // alone returns null here and the UI falls back to a message that names nothing.
  it('names both protocol versions on a protocol-floor refusal', () => {
    const text = describeHandshakeRefusal(
      codedWithData(ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, 'Connect protocol 2.0 is below the required minimum 2.1', {
        reason: 'protocol_incompatible',
        clientProtocol: '2.0',
        requiredProtocol: '2.1',
      }),
    );
    expect(text).toContain('2.0');
    expect(text).toContain('2.1');
  });

  // 4008 is the refusal a dApp that omits `network` actually hits, and its bare message
  // ('dApp targets a different network than the wallet') names neither side.
  it('names both networks on a mismatch', () => {
    const text = describeHandshakeRefusal(
      codedWithData(ERROR_CODES.INCOMPATIBLE_NETWORK, 'dApp targets a different network than the wallet', {
        walletNetwork: { id: 4, name: 'testnet2' },
        clientNetwork: { id: 1, name: 'mainnet' },
      }),
    );
    expect(text).toContain('testnet2');
    expect(text).toContain('mainnet');
  });

  it('tells a dApp that declared no network what to pass', () => {
    const text = describeHandshakeRefusal(
      codedWithData(ERROR_CODES.INCOMPATIBLE_NETWORK, 'dApp targets a different network than the wallet', {
        walletNetwork: { id: 4, name: 'testnet2' },
        clientNetwork: null,
      }),
    );
    expect(text).toContain('testnet2');
    expect(text).toContain('network');
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
