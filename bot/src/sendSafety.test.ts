import { describe, expect, it } from 'vitest';
import { SphereError, isPossiblyCommittedSendOutcome } from '@unicitylabs/sphere-sdk';
import type { SphereErrorCode } from '@unicitylabs/sphere-sdk';
import { POSSIBLY_COMMITTED_CODES, mayBeCommitted } from './sendSafety';

/**
 * Every `SphereErrorCode` in the pinned SDK.
 *
 * The SDK's own `POSSIBLY_COMMITTED_SEND_CODES` is module-private, so there is no set to
 * import and diff against. This array is the substitute universe: sweeping it through
 * `isPossiblyCommittedSendOutcome` asks the SDK about each code in turn, which is what makes
 * the SDK -> us direction checkable at all. Testing only our own set can never notice a code
 * the SDK ADDS — and that is the direction that costs money, because an unrecognised
 * possibly-committed code falls through to the retryable branch and invites a double pay.
 *
 * The `Missing` guard below is what keeps this honest: when an SDK bump grows the union,
 * `tsc --noEmit` fails HERE and names the new code, instead of the sweep quietly skipping it.
 */
const ALL_ERROR_CODES = [
  'NOT_INITIALIZED', 'ALREADY_INITIALIZED', 'INVALID_CONFIG', 'INVALID_IDENTITY',
  'INSUFFICIENT_BALANCE', 'INVALID_RECIPIENT', 'TRANSFER_FAILED', 'TRANSFER_CONFLICT',
  'CERTIFICATION_UNCONFIRMED', 'CHECKPOINT_PERSIST_FAILED', 'SPLIT_CHECKPOINT_LOST',
  'CHECKPOINT_TRUSTBASE_MISMATCH', 'STORAGE_ERROR', 'SEND_SYNC_PENDING',
  'SEND_PARTIALLY_COMPLETED', 'TRANSPORT_ERROR', 'AGGREGATOR_ERROR', 'VALIDATION_ERROR',
  'INVALID_AMOUNT', 'NETWORK_ERROR', 'TIMEOUT', 'DECRYPTION_ERROR', 'MODULE_NOT_AVAILABLE',
  'SIGNING_ERROR', 'SEND_QUEUE_TIMEOUT', 'SEND_INSUFFICIENT_BALANCE',
  'SEND_RESERVATION_CANCELLED', 'SEND_QUEUE_FULL', 'MODULE_DESTROYED', 'REENTRANT_GATE',
  'RATE_LIMITED', 'COMMUNICATIONS_UNAVAILABLE',
  // Invoice + swap codes: the modules were deleted by the payments-v2 flip, but the code
  // union still carries them, so the universe has to include them to stay complete.
  'INVOICE_NO_TARGETS', 'INVOICE_INVALID_ADDRESS', 'INVOICE_NO_ASSETS', 'INVOICE_INVALID_ASSET',
  'INVOICE_INVALID_AMOUNT', 'INVOICE_INVALID_COIN', 'INVOICE_INVALID_NFT',
  'INVOICE_PAST_DUE_DATE', 'INVOICE_DUPLICATE_ADDRESS', 'INVOICE_DUPLICATE_COIN',
  'INVOICE_DUPLICATE_NFT', 'INVOICE_MINT_FAILED', 'INVOICE_INVALID_PROOF',
  'INVOICE_WRONG_TOKEN_TYPE', 'INVOICE_INVALID_DATA', 'INVOICE_ALREADY_EXISTS',
  'INVOICE_NOT_FOUND', 'INVOICE_NOT_TARGET', 'INVOICE_ALREADY_CLOSED',
  'INVOICE_ALREADY_CANCELLED', 'INVOICE_ORACLE_REQUIRED', 'INVOICE_TERMINATED',
  'INVOICE_INVALID_TARGET', 'INVOICE_INVALID_ASSET_INDEX', 'INVOICE_RETURN_EXCEEDS_BALANCE',
  'INVOICE_INVALID_DELIVERY_METHOD', 'INVOICE_INVALID_REFUND_ADDRESS', 'INVOICE_INVALID_CONTACT',
  'INVOICE_INVALID_ID', 'INVOICE_TOO_MANY_TARGETS', 'INVOICE_TOO_MANY_ASSETS',
  'INVOICE_MEMO_TOO_LONG', 'INVOICE_TERMS_TOO_LARGE', 'INVOICE_NOT_TERMINATED',
  'INVOICE_NOT_CANCELLED', 'INVOICE_STORAGE_FAILED',
  'SWAP_INVALID_DEAL', 'SWAP_INVALID_MANIFEST', 'SWAP_NOT_FOUND', 'SWAP_WRONG_STATE',
  'SWAP_RESOLVE_FAILED', 'SWAP_DM_SEND_FAILED', 'SWAP_ESCROW_REJECTED', 'SWAP_DEPOSIT_FAILED',
  'SWAP_PAYOUT_VERIFICATION_FAILED', 'SWAP_ALREADY_EXISTS', 'SWAP_ALREADY_COMPLETED',
  'SWAP_ALREADY_CANCELLED', 'SWAP_TIMEOUT', 'SWAP_LIMIT_EXCEEDED', 'SWAP_ALREADY_INITIALIZED',
  'SWAP_MODULE_DESTROYED', 'SWAP_NOT_INITIALIZED',
] as const satisfies readonly SphereErrorCode[];

// A code the SDK declares that this file has not enumerated. Must be `never`: if it is not,
// the assignment below fails to compile and the error text names the code that was added.
type Missing = Exclude<SphereErrorCode, (typeof ALL_ERROR_CODES)[number]>;
const _everyCodeEnumerated: [Missing] extends [never] ? true : Missing = true;
void _everyCodeEnumerated;

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
   * Pins our mirrored set against the SDK's own, in BOTH directions, over the whole code
   * universe — not just over our own set, which by construction can only confirm what we
   * already believe. A code the SDK starts treating as possibly-committed shows up here as
   * a concrete failure ("SDK says X is committed, we say retryable"), which is the double-pay
   * this module exists to prevent.
   */
  it('mirrors the SDK set exactly, in both directions, across every error code', () => {
    const sdkSays = ALL_ERROR_CODES.filter((code) =>
      isPossiblyCommittedSendOutcome(new SphereError('x', code)),
    );
    const weSay = ALL_ERROR_CODES.filter((code) => POSSIBLY_COMMITTED_CODES.has(code));
    expect([...weSay].sort()).toEqual([...sdkSays].sort());
  });

  // Our set must not contain anything outside the SDK's union either — a typo'd code would
  // sit in the set forever, matching nothing, while looking like coverage.
  it('contains no code the SDK does not declare', () => {
    const declared = new Set<string>(ALL_ERROR_CODES);
    for (const code of POSSIBLY_COMMITTED_CODES) {
      expect(declared.has(code)).toBe(true);
    }
  });
});
