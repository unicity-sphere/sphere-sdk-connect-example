import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import { Button } from '@unicitylabs/sphere-ui';
import { truncate } from '../../lib/format';

interface WalletHeaderProps {
  identity: PublicIdentity;
  onDisconnect: () => void;
}

export function WalletHeader({ identity, onDisconnect }: WalletHeaderProps) {
  return (
    <header className="bg-(--bg-surface) border-b border-white/8 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white">Sphere Connect</h1>
        <span className="hidden sm:inline-block h-5 w-px bg-white/8" />
        {identity.nametag && (
          <span className="hidden sm:inline text-sm font-mono text-orange-400">@{identity.nametag}</span>
        )}
        <span className="hidden md:inline text-xs font-mono text-white/55">
          {truncate(identity.directAddress ?? identity.chainPubkey)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Connected
        </span>
        <Button variant="secondary" onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
    </header>
  );
}
