import { useState, useEffect } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';

interface Asset {
  coinId: string;
  symbol?: string;
  totalAmount: string;
}

interface BalanceDisplayProps {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export function BalanceDisplay({ query }: BalanceDisplayProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<Asset[]>(RPC_METHODS.GET_BALANCE);
      setAssets(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Balance</h2>
        <button
          onClick={fetchBalance}
          className="text-sm text-orange-500 hover:text-orange-700 font-medium cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {loading && assets.length === 0 ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : error ? (
        <div className="text-red-500 text-sm">{error}</div>
      ) : assets.length === 0 ? (
        <div className="text-gray-400 text-sm">No assets found</div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.coinId}
              className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl"
            >
              <span className="font-medium text-gray-700">{asset.symbol ?? asset.coinId}</span>
              <span className="font-mono text-gray-900">{asset.totalAmount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
