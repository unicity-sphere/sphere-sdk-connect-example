import { describe, it, expect } from 'vitest';
import { ConnectError, ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { classifyRequestError, connectErrorCode, lockedData } from './connectErrors';

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
