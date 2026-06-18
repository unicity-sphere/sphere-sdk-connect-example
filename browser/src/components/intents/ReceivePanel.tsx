import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function ReceivePanel({ intent }: Props) {
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true);
    setError(null);
    setRaw(null);
    try {
      const result = await intent(INTENT_ACTIONS.RECEIVE, {});
      setRaw(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
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

      <Button onClick={execute} disabled={loading} className="w-full">
        {loading ? 'Receiving...' : 'Receive Tokens'}
      </Button>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
