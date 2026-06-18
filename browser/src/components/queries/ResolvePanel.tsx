import { useState } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
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
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Resolve</h2>
        <span className="text-[10px] font-mono text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded">sphere_resolve</span>
      </div>
      <p className="text-xs text-white/45 mb-4">Resolve @nametag, address, or pubkey to peer info</p>

      <div className="flex gap-2 mb-3">
        <Input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          placeholder="@nametag, DIRECT://..., pubkey"
          className="flex-1"
          onKeyDown={(e) => e.key === 'Enter' && execute()} />
        <Button onClick={execute} disabled={loading || !identifier}>
          {loading ? '...' : 'Resolve'}
        </Button>
      </div>

      {peer && !error && (
        <div className="mt-4 space-y-2 text-sm">
          {peer.nametag && (
            <div className="flex gap-2"><span className="text-white/45 w-28 shrink-0">Nametag</span><span className="font-mono text-orange-400">@{peer.nametag}</span></div>
          )}
          {peer.chainPubkey && (
            <div className="flex gap-2"><span className="text-white/45 w-28 shrink-0">Chain Pubkey</span><span className="font-mono text-xs text-white/70 break-all">{peer.chainPubkey}</span></div>
          )}
          {peer.directAddress && (
            <div className="flex gap-2"><span className="text-white/45 w-28 shrink-0">Direct Addr</span><span className="font-mono text-xs text-white/70 break-all">{peer.directAddress}</span></div>
          )}
          {peer.transportPubkey && (
            <div className="flex gap-2"><span className="text-white/45 w-28 shrink-0">Transport Key</span><span className="font-mono text-xs text-white/70 break-all">{peer.transportPubkey}</span></div>
          )}
        </div>
      )}

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}
