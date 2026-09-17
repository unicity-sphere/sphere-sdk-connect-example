import type { IntentFailure } from '../../lib/intentFailure';

interface Props {
  failure: IntentFailure | null;
  /** The intent action in doubt — `send`, `mint`, `dm`, … Shown verbatim. */
  action: string;
  /** One sentence naming what the user must check to find out what really happened. */
  reconcile: string;
  /** Clears the doubt and re-enables the form. Wired to a button, never to a timer. */
  onAcknowledge: () => void;
}

/**
 * The reconcile state for INTENT_OUTCOME_UNKNOWN (4201).
 *
 * Deliberately NOT styled or worded as an error. "Failed" is what makes a user press the button
 * again, and pressing it again is the one thing that must not happen while the outcome is
 * unknown: the wallet may have carried the intent out. The submit control stays disabled while
 * this banner is up, and only the explicit button below releases it.
 */
export function OutcomeUnknownBanner({ failure, action, reconcile, onAcknowledge }: Props) {
  if (!failure || failure.kind !== 'outcome-unknown') return null;

  const entries = Object.entries(failure.data ?? {});

  return (
    <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
      <p className="text-sm font-semibold text-amber-400">
        Outcome unknown — this may already have happened
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/60">
        The wallet accepted the <code className="font-mono">{action}</code> intent and the answer
        never came back (a host deadline, a lock, a logout). Connect reports that as{' '}
        <code className="font-mono">INTENT_OUTCOME_UNKNOWN (4201)</code>, which is not a refusal:
        the action may have completed, may be in flight, or may never have run.
      </p>
      <p className="mt-2 text-xs font-semibold text-amber-400">
        Do NOT retry blindly. {reconcile}
      </p>
      {entries.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[10px] font-mono text-white/45">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-white/30">{key}</dt>
              <dd className="break-all">{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-[10px] font-mono text-white/30">{failure.message}</p>
      <button
        type="button"
        onClick={onAcknowledge}
        className="mt-3 text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
      >
        I checked what happened — unlock the form
      </button>
    </div>
  );
}
