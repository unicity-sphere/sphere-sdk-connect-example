import { describe, it, expect } from 'vitest';
import { ConnectError, ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';
import { errorText, isUnresolved, toIntentFailure } from './intentFailure';

const outcomeUnknown = (data?: unknown) =>
  new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN, data);

describe('toIntentFailure', () => {
  it('keeps INTENT_OUTCOME_UNKNOWN (4201) out of the ordinary error channel', () => {
    const failure = toIntentFailure(outcomeUnknown());

    expect(failure.kind).toBe('outcome-unknown');
    // A panel renders `errorText()` as its red "it failed" banner. A 4201 must never land there:
    // "failed" is what makes a user press Send again, and the send may already have gone through.
    expect(errorText(failure)).toBeNull();
    expect(isUnresolved(failure)).toBe(true);
  });

  it('carries the host data through, so a panel can name what is in doubt', () => {
    const failure = toIntentFailure(outcomeUnknown({ tokenId: 'abc123' }));

    expect(failure).toEqual({
      kind: 'outcome-unknown',
      message: 'Intent outcome unknown',
      data: { tokenId: 'abc123' },
    });
  });

  it('tolerates a 4201 with no usable data bag', () => {
    for (const data of [undefined, null, 'nope', ['a'], 7]) {
      const failure = toIntentFailure(outcomeUnknown(data));
      expect(failure.kind === 'outcome-unknown' && failure.data).toBeNull();
    }
  });

  it('treats every other refusal as an ordinary error the user may retry', () => {
    const refusals = [
      ERROR_CODES.USER_REJECTED,
      ERROR_CODES.PERMISSION_DENIED,
      ERROR_CODES.RATE_LIMITED,
      ERROR_CODES.INSUFFICIENT_BALANCE,
      ERROR_CODES.INTENT_CANCELLED,
      ERROR_CODES.WALLET_LOCKED,
    ];
    for (const code of refusals) {
      const failure = toIntentFailure(new ConnectError('refused', code));
      expect(failure.kind).toBe('error');
      expect(isUnresolved(failure)).toBe(false);
      expect(errorText(failure)).toBe('refused');
    }
  });

  it('never invents an outcome-unknown from message text alone', () => {
    // 4201 is decided by the numeric code and nothing else — a codeless failure that happens to
    // mention the words must still be an ordinary error.
    const failure = toIntentFailure(new Error('intent outcome unknown'));
    expect(failure.kind).toBe('error');
  });

  it('survives a non-Error rejection', () => {
    expect(toIntentFailure('boom')).toEqual({ kind: 'error', message: 'Failed' });
    expect(toIntentFailure(null)).toEqual({ kind: 'error', message: 'Failed' });
  });
});

describe('errorText / isUnresolved', () => {
  it('report nothing when no request has failed', () => {
    expect(errorText(null)).toBeNull();
    expect(isUnresolved(null)).toBe(false);
  });
});
