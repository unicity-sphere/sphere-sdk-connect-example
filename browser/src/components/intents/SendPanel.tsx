import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { CoinSelect } from '../ui/CoinSelect';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export function SendPanel({ intent, query }: Props) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [coinId, setCoinId] = useState('');
  const [memo, setMemo] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (!recipient || !amount || !coinId) return;
    setLoading(true);
    setError(null);
    setRaw(null);
    try {
      const to = recipient.startsWith('@') ? recipient : '@' + recipient;
      const params: Record<string, unknown> = { to, amount, coinId };
      if (memo) params.memo = memo;
      const result = await intent(INTENT_ACTIONS.SEND, params);
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
        <h2 className="text-lg font-semibold text-white">Send (L3)</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: send</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Transfer L3 tokens to a recipient</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient (@nametag, DIRECT://..., pubkey)" />
        <div className="flex gap-2">
          <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1" />
          <CoinSelect value={coinId} onChange={setCoinId} query={query} />
        </div>
        <Input type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
          placeholder="Memo (optional)" />
        <Button onClick={execute} disabled={loading || !recipient || !amount || !coinId} className="w-full">
          {loading ? 'Sending...' : 'Send'}
        </Button>
      </div>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
