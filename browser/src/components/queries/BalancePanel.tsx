import { useEffect, useState } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { Button } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { CoinBadge } from '../ui/CoinBadge';
import { formatFiat } from '../../lib/format';

interface BalanceItem {
  coinId: string;
  totalAmount: string;
  symbol?: string;
}

interface Props {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  /**
   * Bumps once per unlock that returned the SAME wallet (useWalletConnect compares the
   * chainPubkey in the wallet:unlocked payload before bumping it).
   *
   * This is the reference retry-after-unlock: a READ is safe to re-issue automatically. An
   * intent never is — it moves money and would fire with no fresh user gesture, at the exact
   * moment the wallet came back — which is why only query panels take this prop.
   */
  unlockEpoch: number;
}

export function BalancePanel({ query, unlockEpoch }: Props) {
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [fiat, setFiat] = useState<number | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true);
    setError(null);
    try {
      const [balResult, fiatResult] = await Promise.all([
        query<BalanceItem[]>(RPC_METHODS.GET_BALANCE),
        query<{ fiatBalance: number | null }>(RPC_METHODS.GET_FIAT_BALANCE),
      ]);
      setBalances(balResult ?? []);
      setFiat(fiatResult?.fiatBalance ?? null);
      setRaw({ balance: balResult, fiatBalance: fiatResult });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlockEpoch === 0) return; // no unlock yet — never fetch on mount
    void execute();
    // Deliberately keyed on unlockEpoch alone: execute() is re-created on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockEpoch]);

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Balance</h2>
        <div className="flex gap-1">
          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded">getBalance</span>
          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded">getFiatBalance</span>
        </div>
      </div>
      <p className="text-xs text-white/45 mb-4">Coin balances + total fiat value</p>

      <Button onClick={execute} disabled={loading} className="w-full">
        {loading ? 'Loading...' : 'Fetch Balance'}
      </Button>

      {(balances.length > 0 || fiat !== null) && !error && (
        <div className="mt-4">
          {fiat !== null && (
            <div className="text-center py-3 mb-3 bg-orange-500/10 rounded-xl">
              <div className="text-2xl font-bold text-white">{formatFiat(fiat)}</div>
              <div className="text-xs text-white/45">Total Portfolio Value</div>
            </div>
          )}
          <div className="space-y-2">
            {balances.map((b) => (
              <div key={b.coinId} className="flex items-center justify-between py-2 px-3 bg-white/3 rounded-xl">
                <CoinBadge symbol={b.symbol ?? b.coinId} size="sm" />
                <span className="font-mono text-sm text-white">{b.totalAmount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
