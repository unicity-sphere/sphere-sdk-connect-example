import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { errorText, isUnresolved, toIntentFailure, type IntentFailure } from '../../lib/intentFailure';
import { OutcomeUnknownBanner } from '../ui/OutcomeUnknownBanner';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function ReceivePanel({ intent }: Props) {
  const [raw, setRaw] = useState<unknown>(null);
  const [failure, setFailure] = useState<IntentFailure | null>(null);
  const [loading, setLoading] = useState(false);

  // Even an idempotent-looking intent gets the lock: 4201 says the wallet may still be working
  // on it, and a second poll racing the first is how a claim gets processed twice.
  const unresolved = isUnresolved(failure);

  const execute = async () => {
    if (unresolved) return;
    setLoading(true);
    setFailure(null);
    setRaw(null);
    try {
      const result = await intent(INTENT_ACTIONS.RECEIVE, {});
      setRaw(result);
    } catch (err) {
      // INTENT_OUTCOME_UNKNOWN (4201) is not a refusal — see src/lib/intentFailure.ts.
      setFailure(toIntentFailure(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Receive</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: receive</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Explicit one-shot poll for pending incoming transfers via Nostr</p>
      <p className="text-[11px] text-white/45 mb-1">In a live wallet transfers arrive automatically — this is for CLI/batch scenarios without a persistent connection</p>
      <p className="text-[11px] text-red-500 mb-1">Not yet implemented in wallet — will show "Unknown Intent"</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <Button onClick={execute} disabled={loading || unresolved} className="w-full">
        {loading ? 'Receiving...' : unresolved ? 'Receive Tokens (locked — outcome unknown)' : 'Receive Tokens'}
      </Button>

      <OutcomeUnknownBanner
        failure={failure}
        action="receive"
        reconcile="Re-read the wallet's token list first — the transfers may already have been claimed."
        onAcknowledge={() => setFailure(null)}
      />

      <ResultDisplay result={raw} error={errorText(failure)} />
    </div>
  );
}
