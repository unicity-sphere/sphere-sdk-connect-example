import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Textarea } from '@unicitylabs/sphere-ui';
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
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Sign Message</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: sign_message</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Sign an arbitrary message with wallet key (e.g. for authentication or proof of ownership)</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Message to sign" rows={4} />
        <Button onClick={execute} disabled={loading || !message} className="w-full">
          {loading ? 'Signing...' : 'Sign Message'}
        </Button>
      </div>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
