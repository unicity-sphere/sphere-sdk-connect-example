import { describe, expect, it } from 'vitest';
import { SphereError, isPossiblyCommittedSendOutcome } from '@unicitylabs/sphere-sdk';
import { POSSIBLY_COMMITTED_CODES, mayBeCommitted } from './sendSafety';

describe('mayBeCommitted', () => {
  it('agrees with the SDK predicate on a real SphereError', () => {
    for (const code of POSSIBLY_COMMITTED_CODES) {
      const err = new SphereError('boom', code as never);
      expect(isPossiblyCommittedSendOutcome(err)).toBe(true);
      expect(mayBeCommitted(err)).toBe(true);
    }
  });

  /**
   * The reason this helper exists. A duplicated SDK copy makes `instanceof
   * SphereError` false, so the SDK predicate returns false for a genuinely
   * possibly-committed outcome. Without the duck-typed fallback the bot would
   * print "Send failed" and a caller would retry — a double pay.
   */
  it('still catches a possibly-committed outcome when instanceof fails', () => {
    const foreign = Object.assign(new Error('cross-bundle copy'), {
      code: 'SEND_PARTIALLY_COMPLETED',
    });
    expect(isPossiblyCommittedSendOutcome(foreign)).toBe(false);
    expect(mayBeCommitted(foreign)).toBe(true);
  });

  it('catches every code across the bundle boundary, not just the partial one', () => {
    for (const code of POSSIBLY_COMMITTED_CODES) {
      expect(mayBeCommitted(Object.assign(new Error('x'), { code }))).toBe(true);
    }
  });

  it('leaves a clean failure retryable', () => {
    expect(mayBeCommitted(new SphereError('nope', 'SEND_INSUFFICIENT_BALANCE'))).toBe(false);
    expect(mayBeCommitted(Object.assign(new Error('x'), { code: 'INVALID_RECIPIENT' }))).toBe(false);
    expect(mayBeCommitted(new Error('network down'))).toBe(false);
  });

  it('does not throw on null/undefined/non-objects', () => {
    expect(mayBeCommitted(null)).toBe(false);
    expect(mayBeCommitted(undefined)).toBe(false);
    expect(mayBeCommitted('SEND_PARTIALLY_COMPLETED')).toBe(false);
    expect(mayBeCommitted({ code: 123 })).toBe(false);
  });

  /**
   * Pins our mirrored set against the SDK's own. If a future SDK adds a
   * possibly-committed code, this fails instead of silently letting the new
   * code fall through to the retryable branch.
   */
  it('mirrors the SDK set exactly', () => {
    const notCommitted = ['SEND_INSUFFICIENT_BALANCE', 'INVALID_RECIPIENT', 'TRANSFER_CONFLICT', 'TIMEOUT'];
    for (const code of notCommitted) {
      expect(isPossiblyCommittedSendOutcome(new SphereError('x', code as never))).toBe(false);
      expect(POSSIBLY_COMMITTED_CODES.has(code)).toBe(false);
    }
    for (const code of POSSIBLY_COMMITTED_CODES) {
      expect(isPossiblyCommittedSendOutcome(new SphereError('x', code as never))).toBe(true);
    }
  });
});
