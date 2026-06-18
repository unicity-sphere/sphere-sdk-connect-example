import { useState } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

interface IdentityData {
  chainPubkey: string;
  directAddress?: string;
  nametag?: string;
}

export function IdentityPanel({ query }: Props) {
  const [data, setData] = useState<IdentityData | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await query<IdentityData>(RPC_METHODS.GET_IDENTITY);
      setData(result);
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
        <h2 className="text-lg font-semibold text-gray-900">Identity</h2>
        <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-2 py-0.5 rounded">sphere_getIdentity</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Read wallet identity (pubkey, addresses, nametag)</p>

      <button onClick={execute} disabled={loading}
        className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
        {loading ? 'Loading...' : 'Get Identity'}
      </button>

      {data && !error && (
        <div className="mt-4 space-y-3">
          {data.nametag && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">Nametag</span>
              <span className="font-mono text-sm text-orange-600">@{data.nametag}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 w-24 shrink-0">Chain Pubkey</span>
            <span className="font-mono text-xs text-gray-700 break-all">{data.chainPubkey}</span>
          </div>
          {data.directAddress && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-400 w-24 shrink-0">Direct Addr</span>
              <span className="font-mono text-xs text-gray-700 break-all">{data.directAddress}</span>
            </div>
          )}
        </div>
      )}

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
