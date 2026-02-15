import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';

interface WalletInfoProps {
  identity: PublicIdentity;
  onDisconnect: () => void;
}

export function WalletInfo({ identity, onDisconnect }: WalletInfoProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Wallet Connected</h2>
        <button
          onClick={onDisconnect}
          className="text-sm text-red-500 hover:text-red-700 font-medium cursor-pointer"
        >
          Disconnect
        </button>
      </div>

      <div className="space-y-3 text-sm">
        {identity.nametag && (
          <div>
            <span className="text-gray-500">Nametag:</span>
            <span className="ml-2 font-mono text-orange-600">@{identity.nametag}</span>
          </div>
        )}
        <div>
          <span className="text-gray-500">Chain Pubkey:</span>
          <span className="ml-2 font-mono text-gray-700 text-xs break-all">{identity.chainPubkey}</span>
        </div>
        <div>
          <span className="text-gray-500">L1 Address:</span>
          <span className="ml-2 font-mono text-gray-700 text-xs break-all">{identity.l1Address}</span>
        </div>
        {identity.directAddress && (
          <div>
            <span className="text-gray-500">Direct Address:</span>
            <span className="ml-2 font-mono text-gray-700 text-xs break-all">{identity.directAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}
