import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Receive</h2>
        <span className="text-[10px] font-mono text-orange-500 bg-orange-50 px-2 py-0.5 rounded">intent: receive</span>
      </div>
      <p className="text-xs text-gray-400 mb-1">Explicit one-shot poll for pending incoming transfers via Nostr</p>
      <p className="text-[11px] text-gray-400 mb-1">In a live wallet transfers arrive automatically — this is for CLI/batch scenarios without a persistent connection</p>
      <p className="text-[11px] text-red-500 mb-1">Not yet implemented in wallet — will show "Unknown Intent"</p>
      <p className="text-[11px] text-yellow-600 mb-4">Requires wallet approval</p>

      <button onClick={execute} disabled={loading}
        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
        {loading ? 'Receiving...' : 'Receive Tokens'}
      </button>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
