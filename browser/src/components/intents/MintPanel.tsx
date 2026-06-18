import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

/**
 * Quick-fill presets mirroring the Sphere wallet's Top Up basket
 * (sphere/src/sdk/hooks/payments/useTopUp.ts) on testnet2: the same coins and
 * human amounts (UCT 100, BTC 0.01, SOL 1, ETH 0.5), with each coinId +
 * smallest-unit amount resolved from the testnet2 token registry
 * (unicity-ids.testnet2.json).
 */
const PRESETS: { label: string; coinId: string; amount: string }[] = [
  { label: 'UCT 100', coinId: 'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0', amount: '100000000000000000000' },
  { label: 'BTC 0.01', coinId: '3cc412d8a24510d424f74de4c471d22298b7f52625af6fd3ecb3c3d9e1a683fb', amount: '1000000' },
  { label: 'SOL 1', coinId: '72f7771d5690afcf89cfc16e8ee8c1a836d0faa8ed1b34d527aabc18acb949ae', amount: '1000000000' },
  { label: 'ETH 0.5', coinId: '746a4e75aeb3221462f762fc41925735983c6039e89288bbb632a8fb1012e7d0', amount: '500000000000000000' },
];

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
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Mint (L3)</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: mint</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Self-mint a fungible token to the connected wallet</p>
      <p className="text-[11px] text-amber-400 mb-3">Requires wallet approval · works only where the network allows self-mint (testnet2)</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[11px] text-white/45 self-center mr-1">Presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setCoinId(p.coinId); setAmount(p.amount); }}
            className="text-xs font-medium px-2.5 py-1 rounded-lg border border-white/8 text-white/55 hover:border-orange-400 hover:text-orange-400 transition-colors cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Input type="text" value={coinId} onChange={(e) => setCoinId(e.target.value)}
          placeholder="Coin ID (lowercase hex, e.g. 1111…)"
          className="font-mono" />
        <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (smallest units)" />
        <Button onClick={execute} disabled={loading || !coinId || !amount} className="w-full">
          {loading ? 'Minting...' : 'Mint'}
        </Button>
      </div>

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
