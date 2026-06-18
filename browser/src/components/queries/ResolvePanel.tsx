import { useState } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { ResultDisplay } from '../ui/ResultDisplay';
import type { PeerInfo } from '../../lib/types';

interface Props {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export function ResolvePanel({ query }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (!identifier) return;
    setLoading(true);
    setError(null);
    setPeer(null);
    try {
      const id = identifier.startsWith('@') ? identifier : '@' + identifier;
      const result = await query<PeerInfo>(RPC_METHODS.RESOLVE, { identifier: id });
      setPeer(result);
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
        <h2 className="text-lg font-semibold text-gray-900">Resolve</h2>
        <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-2 py-0.5 rounded">sphere_resolve</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Resolve @nametag, address, or pubkey to peer info</p>

      <div className="flex gap-2 mb-3">
        <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          placeholder="@nametag, DIRECT://..., pubkey"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          onKeyDown={(e) => e.key === 'Enter' && execute()} />
        <button onClick={execute} disabled={loading || !identifier}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed text-sm">
          {loading ? '...' : 'Resolve'}
        </button>
      </div>

      {peer && !error && (
        <div className="mt-4 space-y-2 text-sm">
          {peer.nametag && (
            <div className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">Nametag</span><span className="font-mono text-orange-600">@{peer.nametag}</span></div>
          )}
          {peer.chainPubkey && (
            <div className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">Chain Pubkey</span><span className="font-mono text-xs text-gray-700 break-all">{peer.chainPubkey}</span></div>
          )}
          {peer.directAddress && (
            <div className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">Direct Addr</span><span className="font-mono text-xs text-gray-700 break-all">{peer.directAddress}</span></div>
          )}
          {peer.transportPubkey && (
            <div className="flex gap-2"><span className="text-gray-400 w-28 shrink-0">Transport Key</span><span className="font-mono text-xs text-gray-700 break-all">{peer.transportPubkey}</span></div>
          )}
        </div>
      )}

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
