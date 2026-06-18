import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function MintPanel({ intent }: Props) {
  const [coinId, setCoinId] = useState('');
  const [amount, setAmount] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (!coinId || !amount) return;
    setLoading(true);
    setError(null);
    setRaw(null);
    try {
      const result = await intent(INTENT_ACTIONS.MINT, { coinId, amount });
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
        <h2 className="text-lg font-semibold text-gray-900">Mint (L3)</h2>
        <span className="text-[10px] font-mono text-orange-500 bg-orange-50 px-2 py-0.5 rounded">intent: mint</span>
      </div>
      <p className="text-xs text-gray-400 mb-1">Self-mint a fungible token to the connected wallet</p>
      <p className="text-[11px] text-yellow-600 mb-4">Requires wallet approval · works only where the network allows self-mint (testnet2)</p>

      <div className="space-y-3">
        <input type="text" value={coinId} onChange={(e) => setCoinId(e.target.value)}
          placeholder="Coin ID (lowercase hex, e.g. 1111…)"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
        <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (smallest units)"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
        <button onClick={execute} disabled={loading || !coinId || !amount}
          className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
          {loading ? 'Minting...' : 'Mint'}
        </button>
      </div>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
