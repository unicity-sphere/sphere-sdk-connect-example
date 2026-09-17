/**
 * What an intent panel must render after `intent()` rejected.
 *
 * Every panel used to do `setError(err.message)` and re-enable its button. That is right for a
 * refusal and WRONG for INTENT_OUTCOME_UNKNOWN (4201): there the wallet TOOK the intent and only
 * the answer was lost — a host deadline, a lock, a logout — so the action may already have
 * happened. Re-enabling Send on a 4201 invites a second send, and a second send consumes a
 * different source token and pays twice. That is the one reaction this module exists to forbid.
 *
 * `classifyRequestError()` (src/lib/connectErrors.ts) already tells the two apart on the numeric
 * code. This turns that classification into the shape a panel renders.
 */
import { classifyRequestError } from './connectErrors';

export type IntentFailure =
  /** An ordinary refusal — the action did NOT happen. Show it; the user may try again. */
  | { kind: 'error'; message: string }
  /**
   * INTENT_OUTCOME_UNKNOWN (4201). **Unresolved, not failed.** The form stays locked until the
   * user reconciles out of band (poll the recipient, your backend, the aggregator) and says so.
   *
   * `data` is whatever the host attached before the answer was lost — a `tokenId`, a request id.
   * It is read defensively: it crosses postMessage from a peer on an SDK version this app does
   * not control.
   */
  | { kind: 'outcome-unknown'; message: string; data: Record<string, unknown> | null };

/** The structured `data` bag of an error, when it is a plain object. */
function failureData(err: unknown): Record<string, unknown> | null {
  if (typeof err !== 'object' || err === null) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function failureMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Failed';
}

/**
 * Classify a rejected intent for the UI.
 *
 * Note what is NOT special-cased: 'locked' and 'teardown' come back as ordinary errors here,
 * because `useWalletConnect` has already reacted to them (lock banner / teardown) by the time the
 * panel's catch runs — see its `handleRequestError`. The panel's only remaining job is to keep a
 * 4201 apart from a refusal.
 */
export function toIntentFailure(err: unknown): IntentFailure {
  if (classifyRequestError(err) === 'outcome-unknown') {
    return { kind: 'outcome-unknown', message: failureMessage(err), data: failureData(err) };
  }
  return { kind: 'error', message: failureMessage(err) };
}

/** The text for an ordinary error banner — null while the outcome is merely unknown. */
export function errorText(failure: IntentFailure | null): string | null {
  return failure && failure.kind === 'error' ? failure.message : null;
}

/**
 * True while an action's outcome is unknown. **Disable the submit control on this.** It stays
 * true until a human acknowledges having reconciled the action; nothing clears it automatically,
 * because nothing on this side of the wire can learn what the wallet did.
 */
export function isUnresolved(failure: IntentFailure | null): boolean {
  return failure?.kind === 'outcome-unknown';
}
