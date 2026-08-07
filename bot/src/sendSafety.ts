/**
 * The single money-safety decision a bot has to get right.
 *
 * When `payments.send()` rejects, there are two very different worlds:
 *
 *   1. **Nothing was committed** — insufficient balance, unknown recipient, a
 *      pre-submit validation error. Retrying is fine.
 *   2. **The spend may already be on-chain** — the submit was accepted (or
 *      thrown) and the proof fetch was inconclusive. Retrying is a DOUBLE PAY:
 *      a fresh `send()` gets a new `transferId` over different source tokens,
 *      so the recipient can be paid twice for one intent.
 *
 * The only safe recovery for (2) is `payments.resumeNow()`, which replays the
 * SAME intent rather than issuing a second spend.
 *
 * `isPossiblyCommittedSendOutcome` is the SDK's own predicate and is
 * authoritative — but it gates on `instanceof SphereError`, which silently
 * returns `false` when two copies of the SDK end up in one dependency tree
 * (the same hazard this repo's `browser/src/lib/connectErrors.ts` calls out for
 * `ConnectError`). A false negative there routes a possibly-committed send into
 * the "failed, safe to retry" branch, which is the one mistake that costs money.
 *
 * So we duck-type the same code set as a fallback and deliberately err toward
 * "may be committed": labelling a committed send as failed invites the retry;
 * labelling a failed send as possibly-committed only costs a `resume` call.
 */
import { isPossiblyCommittedSendOutcome } from '@unicitylabs/sphere-sdk';

/**
 * The SDK's `POSSIBLY_COMMITTED_SEND_CODES`, mirrored for the duck-typed path.
 * Verified against `@unicitylabs/sphere-sdk` 0.14.1; `sendSafety.test.ts` pins
 * it so an SDK bump that adds a code fails loudly here instead of silently
 * downgrading a new possibly-committed outcome to "retryable".
 */
export const POSSIBLY_COMMITTED_CODES: ReadonlySet<string> = new Set([
  'SEND_SYNC_PENDING',
  'CERTIFICATION_UNCONFIRMED',
  'CHECKPOINT_PERSIST_FAILED',
  'SPLIT_CHECKPOINT_LOST',
  'CHECKPOINT_TRUSTBASE_MISMATCH',
  'SEND_PARTIALLY_COMPLETED',
]);

/** True when the spend behind a rejected `send()` may already be on-chain. Never re-send; `resumeNow()`. */
export function mayBeCommitted(err: unknown): boolean {
  if (isPossiblyCommittedSendOutcome(err)) return true;
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && POSSIBLY_COMMITTED_CODES.has(code);
}
