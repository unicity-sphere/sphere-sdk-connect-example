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
 * How much of the host's `data` bag is worth rendering. It crosses postMessage from a peer on an
 * SDK version this app does not control, so its size is not ours to assume: a megabyte-long
 * string or a hundred keys would push the acknowledge button — the only way out of the lock —
 * off the screen. Bound it, say what was left out, and keep the button reachable.
 */
const MAX_ENTRIES = 8;
const MAX_KEY_CHARS = 48;
const MAX_VALUE_CHARS = 240;

function clamp(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}… (${text.length} chars)` : text;
}

/** One `data` value as a bounded single line. A non-string is JSON, a circular one is its type. */
function renderValue(value: unknown): string {
  if (typeof value === 'string') return clamp(value, MAX_VALUE_CHARS);
  try {
    return clamp(JSON.stringify(value) ?? String(value), MAX_VALUE_CHARS);
  } catch {
    return `[unserialisable ${typeof value}]`;
  }
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

  const allEntries = Object.entries(failure.data ?? {});
  const entries = allEntries.slice(0, MAX_ENTRIES);
  const hidden = allEntries.length - entries.length;

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
              <dt className="text-white/30">{clamp(key, MAX_KEY_CHARS)}</dt>
              <dd className="break-all">{renderValue(value)}</dd>
            </div>
          ))}
          {hidden > 0 && (
            <div className="contents">
              <dt className="text-white/30">…</dt>
              <dd className="text-white/30">{hidden} more field{hidden === 1 ? '' : 's'} not shown</dd>
            </div>
          )}
        </dl>
      )}
      <p className="mt-2 text-[10px] font-mono text-white/30 break-all">{clamp(failure.message, MAX_VALUE_CHARS)}</p>
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
