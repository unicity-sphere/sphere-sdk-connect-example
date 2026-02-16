import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function SignMessagePanel({ intent }: Props) {
  const [message, setMessage] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (!message) return;
    setLoading(true);
    setError(null);
    setRaw(null);
    try {
      const result = await intent(INTENT_ACTIONS.SIGN_MESSAGE, { message });
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
        <h2 className="text-lg font-semibold text-gray-900">Sign Message</h2>
        <span className="text-[10px] font-mono text-orange-500 bg-orange-50 px-2 py-0.5 rounded">intent: sign_message</span>
      </div>
      <p className="text-xs text-gray-400 mb-1">Sign an arbitrary message with wallet key (e.g. for authentication or proof of ownership)</p>
      <p className="text-[11px] text-red-500 mb-1">Not yet implemented in wallet — will show "Unknown Intent"</p>
      <p className="text-[11px] text-yellow-600 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Message to sign" rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 resize-none" />
        <button onClick={execute} disabled={loading || !message}
          className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
          {loading ? 'Signing...' : 'Sign Message'}
        </button>
      </div>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
