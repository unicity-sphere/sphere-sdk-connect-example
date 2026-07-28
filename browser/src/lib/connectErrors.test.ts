import { describe, it, expect } from 'vitest';
import { ConnectError, ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { classifyRequestError, connectErrorCode, lockedData, describeConnectFailure } from './connectErrors';

/** Exactly what ConnectHost sends on a 4009 in Release 1. */
const locked = () => new ConnectError('Wallet is locked', ERROR_CODES.WALLET_LOCKED, { reason: 'locked' });

describe('classifyRequestError', () => {
  it('treats WALLET_LOCKED as a lock, never as a teardown', () => {
    expect(classifyRequestError(locked())).toBe('locked');
  });

  it('treats a dead session as a teardown', () => {
    expect(classifyRequestError(new ConnectError('Not connected', ERROR_CODES.NOT_CONNECTED))).toBe('teardown');
    expect(classifyRequestError(new ConnectError('Session expired', ERROR_CODES.SESSION_EXPIRED))).toBe('teardown');
  });

  it('leaves typed refusals that keep the session alive alone', () => {
    const survivable = [
      ERROR_CODES.PERMISSION_DENIED,
      ERROR_CODES.USER_REJECTED,
      ERROR_CODES.RATE_LIMITED,
      ERROR_CODES.INTENT_CANCELLED,
      ERROR_CODES.INCOMPATIBLE_NETWORK,
      ERROR_CODES.INSUFFICIENT_BALANCE,
      ERROR_CODES.INTERNAL_ERROR,
    ];
    for (const code of survivable) {
      expect(classifyRequestError(new ConnectError('refused', code))).toBe('other');
    }
  });

  // CANARY for the regex this replaces (/not.connected|timeout|transport|closed|session/i):
  // a coded refusal whose text merely MENTIONS a session used to force a full disconnect.
  it('lets the code win over the message text', () => {
    const err = new ConnectError('No active session for this method', ERROR_CODES.PERMISSION_DENIED);
    expect(classifyRequestError(err)).toBe('other');
  });

  // 'Wallet is locked' is a documented recommendation, NOT a wire contract. A wallet that
  // words it differently must still be classified as locked, on the code alone.
  it('does not depend on the refusal text', () => {
    expect(classifyRequestError(new ConnectError('Gesperrt', ERROR_CODES.WALLET_LOCKED, { reason: 'locked' }))).toBe('locked');
  });

  it('falls back to message text for the SDK errors that carry no code at all', () => {
    // SphereError('Not connected', …) — ConnectClient.query/intent before a handshake.
    // SphereError.code is a STRING, so these never reach the coded branch.
    expect(classifyRequestError(new Error('Not connected'))).toBe('teardown');
    expect(classifyRequestError(new Error('Query timeout: sphere_getBalance'))).toBe('teardown');
    expect(classifyRequestError(new Error('Intent timeout: send'))).toBe('teardown');
    expect(classifyRequestError(new Error('Connection timeout'))).toBe('teardown');
    expect(classifyRequestError(new Error('Disconnected'))).toBe('teardown');
    expect(classifyRequestError(new Error('Wallet popup was closed'))).toBe('teardown');
  });

  it('does not tear down on an unknown codeless failure', () => {
    expect(classifyRequestError(new Error('Something exploded'))).toBe('other');
    expect(classifyRequestError(null)).toBe('other');
    expect(classifyRequestError('boom')).toBe('other');
  });
});

describe('connectErrorCode', () => {
  it('reads a numeric code off a duck-typed error', () => {
    expect(connectErrorCode(locked())).toBe(4009);
    expect(connectErrorCode({ code: 4009 })).toBe(4009);
  });

  it('ignores non-numeric codes — SphereError.code is a string', () => {
    expect(connectErrorCode(new Error('x'))).toBeUndefined();
    expect(connectErrorCode({ code: 'NOT_INITIALIZED' })).toBeUndefined();
    expect(connectErrorCode(null)).toBeUndefined();
  });
});

describe('lockedData', () => {
  it('reads the WalletLockedData the host attaches to every 4009', () => {
    expect(lockedData(locked())).toEqual({ reason: 'locked' });
  });

  it('returns undefined when the error is not a 4009 or carries no data', () => {
    expect(lockedData(new ConnectError('Wallet is locked', ERROR_CODES.WALLET_LOCKED))).toBeUndefined();
    expect(lockedData(new ConnectError('Not connected', ERROR_CODES.NOT_CONNECTED, { reason: 'locked' }))).toBeUndefined();
    expect(lockedData(new Error('boom'))).toBeUndefined();
  });
});

describe('INTENT_OUTCOME_UNKNOWN is its own kind', () => {
  it('is not lumped in with ordinary refusals', () => {
    const err = new ConnectError('unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN);

    // 'other' would be read by a panel as "it failed, let them press Send again" — which is
    // the one reaction this code exists to forbid, because the transfer may have gone through.
    expect(classifyRequestError(err)).toBe('outcome-unknown');
  });

  it('does not tear the connection down — the session is fine, only the answer was lost', () => {
    const err = new ConnectError('unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN);
    expect(classifyRequestError(err)).not.toBe('teardown');
  });
});

/**
 * The connect screen's red banner is the only place a developer learns their app was
 * turned away. `error.message` from an older wallet says "SDK version below the required
 * minimum" and names nothing; the version floor it compared is right there in
 * `error.data`. Read it — a refusal that does not say which version to move to is a
 * bug report the developer cannot act on.
 */
describe('describeConnectFailure', () => {
  const gate = (data: Record<string, unknown>) =>
    new ConnectError('SDK version below the required minimum', ERROR_CODES.UNSUPPORTED_PROTOCOL_VERSION, data);

  it('names the SDK version this app has and the one the wallet wants', () => {
    const s = describeConnectFailure(gate({ reason: 'protocol_incompatible', requiredSdk: '0.12.0-0', actualSdk: '0.11.9' }));
    expect(s).toContain('0.11.9');
    expect(s).toContain('0.12.0-0');
  });

  it('still names the required version when this app reported none', () => {
    const s = describeConnectFailure(gate({ reason: 'protocol_incompatible', requiredSdk: '0.12.0-0', actualSdk: null }));
    expect(s).toContain('0.12.0-0');
    expect(s).not.toContain('null');
  });

  it('names both protocol versions on a protocol floor', () => {
    const s = describeConnectFailure(gate({ reason: 'protocol_incompatible', clientProtocol: '2.0', requiredProtocol: '2.1' }));
    expect(s).toContain('2.0');
    expect(s).toContain('2.1');
  });

  it('names both networks on a network mismatch', () => {
    const err = new ConnectError('dApp targets a different network', ERROR_CODES.INCOMPATIBLE_NETWORK, {
      reason: 'network_incompatible',
      walletNetwork: { id: 4 },
      clientNetwork: { id: 1, name: 'mainnet' },
    });
    const s = describeConnectFailure(err);
    expect(s).toContain('mainnet');
    expect(s).toContain('4');
  });

  it('falls back to the wallet message when the gate sent no versions', () => {
    // A newer wallet already names them in the message — do not second-guess it.
    const s = describeConnectFailure(gate({ reason: 'protocol_incompatible' }));
    expect(s).toBe('SDK version below the required minimum');
  });

  it('passes non-gate failures through untouched', () => {
    expect(describeConnectFailure(new Error('Wallet popup was closed'))).toBe('Wallet popup was closed');
    expect(describeConnectFailure('nope')).toBe('Connection failed');
  });
});
