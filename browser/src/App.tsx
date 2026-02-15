import { useWalletConnect } from './hooks/useWalletConnect';
import { ConnectButton } from './components/ConnectButton';
import { WalletInfo } from './components/WalletInfo';
import { BalanceDisplay } from './components/BalanceDisplay';
import { ActionPanel } from './components/ActionPanel';
import { EventLog } from './components/EventLog';

export default function App() {
  const wallet = useWalletConnect();

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ConnectButton
          onConnect={wallet.connect}
          isConnecting={wallet.isConnecting}
          error={wallet.error}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sphere Connect Demo</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WalletInfo
            identity={wallet.identity!}
            onDisconnect={wallet.disconnect}
          />
          <BalanceDisplay query={wallet.query} />
          <ActionPanel intent={wallet.intent} query={wallet.query} />
          <EventLog on={wallet.on} />
        </div>
      </div>
    </div>
  );
}
