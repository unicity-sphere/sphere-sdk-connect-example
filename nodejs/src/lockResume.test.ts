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

  // The SDK floor (4007). `actualSdk` is a version STRING for any client on sphere-sdk
  // >= 0.10.1 — a wallet naming the version is the normal case, not the exotic one.
  it('names both versions on an SDK-floor refusal', () => {
    const text = describeConnectFailure(
      new ConnectError('SDK version 0.13.1 is below the required minimum 0.14.1-0', ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, {
        reason: 'protocol_incompatible',
        requiredSdk: '0.14.1-0',
        actualSdk: '0.13.1',
      }),
    );
    expect(text).toContain('0.13.1');
    expect(text).toContain('0.14.1-0');
  });

  it('says so plainly when the client reported no version at all', () => {
    const text = describeConnectFailure(
      new ConnectError('SDK version unknown (not reported) is below the required minimum 0.14.1-0', ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, {
        reason: 'protocol_incompatible',
        requiredSdk: '0.14.1-0',
        actualSdk: null,
      }),
    );
    expect(text).toContain('reported no sphere-sdk version');
    expect(text).toContain('0.14.1-0');
  });

  // The protocol floor is a DIFFERENT 4007 payload — no requiredSdk, so a describer that
  // only handles the SDK branch silently degrades to the bare message.
  it('names both protocol versions on a protocol-floor refusal', () => {
    const text = describeConnectFailure(
      new ConnectError('Connect protocol 2.0 is below the required minimum 2.1', ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, {
        reason: 'protocol_incompatible',
        clientProtocol: '2.0',
        requiredProtocol: '2.1',
      }),
    );
    expect(text).toContain('2.0');
    expect(text).toContain('2.1');
  });

  // 4008 is what a dApp that forgets `network` actually hits, and the bare message
  // ('dApp targets a different network than the wallet') names neither side.
  it('names both networks on a network mismatch', () => {
    const text = describeConnectFailure(
      new ConnectError('dApp targets a different network than the wallet', ERROR_CODES.INCOMPATIBLE_NETWORK, {
        walletNetwork: { id: 4, name: 'testnet2' },
        clientNetwork: { id: 1, name: 'mainnet' },
      }),
    );
    expect(text).toContain('testnet2');
    expect(text).toContain('mainnet');
  });

  it('tells a dApp that declared no network what to pass', () => {
    const text = describeConnectFailure(
      new ConnectError('dApp targets a different network than the wallet', ERROR_CODES.INCOMPATIBLE_NETWORK, {
        walletNetwork: { id: 4, name: 'testnet2' },
        clientNetwork: null,
      }),
    );
    expect(text).toContain('testnet2');
    expect(text).toContain('network');
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
