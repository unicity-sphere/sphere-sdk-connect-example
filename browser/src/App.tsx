import { useState } from 'react';
import { useWalletConnect } from './hooks/useWalletConnect';
import { ConnectButton } from './components/ConnectButton';
import { PageShell } from './components/layout/PageShell';
import type { Section } from './lib/types';

// Query panels
import { IdentityPanel } from './components/queries/IdentityPanel';
import { AssetsPanel } from './components/queries/AssetsPanel';
import { BalancePanel } from './components/queries/BalancePanel';
import { TokensPanel } from './components/queries/TokensPanel';
import { HistoryPanel } from './components/queries/HistoryPanel';
import { L1BalancePanel } from './components/queries/L1BalancePanel';
import { L1HistoryPanel } from './components/queries/L1HistoryPanel';
import { ResolvePanel } from './components/queries/ResolvePanel';

// Intent panels
import { SendPanel } from './components/intents/SendPanel';
import { L1SendPanel } from './components/intents/L1SendPanel';
import { DMPanel } from './components/intents/DMPanel';
import { PaymentRequestPanel } from './components/intents/PaymentRequestPanel';
import { ReceivePanel } from './components/intents/ReceivePanel';
import { SignMessagePanel } from './components/intents/SignMessagePanel';

// Chat
import { ChatPanel } from './components/chat/ChatPanel';

// Events
import { EventLogPanel } from './components/events/EventLogPanel';

export default function App() {
  const wallet = useWalletConnect();
  const [section, setSection] = useState<Section>('assets');

  if (!wallet.isConnected) {
    // Blank screen during silent auto-connect — avoids flash of Connect button
    if (wallet.isAutoConnecting) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-orange-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Connecting to wallet...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50">
        <ConnectButton
          onConnect={wallet.connect}
          onConnectExtension={wallet.connectViaExtension}
          onConnectPopup={wallet.connectViaPopup}
          isConnecting={wallet.isConnecting}
          extensionInstalled={wallet.extensionInstalled}
          error={wallet.error}
        />
      </div>
    );
  }

  const { query, intent, on } = wallet;

  const panels: Record<Section, React.ReactNode> = {
    'identity': <IdentityPanel query={query} />,
    'assets': <AssetsPanel query={query} />,
    'balance': <BalancePanel query={query} />,
    'tokens': <TokensPanel query={query} />,
    'history': <HistoryPanel query={query} />,
    'l1-balance': <L1BalancePanel query={query} />,
    'l1-history': <L1HistoryPanel query={query} />,
    'resolve': <ResolvePanel query={query} />,
    'send': <SendPanel intent={intent} query={query} />,
    'l1-send': <L1SendPanel intent={intent} query={query} />,
    'dm': <DMPanel intent={intent} />,
    'payment-request': <PaymentRequestPanel intent={intent} query={query} />,
    'receive': <ReceivePanel intent={intent} />,
    'sign-message': <SignMessagePanel intent={intent} />,
    'chat': <ChatPanel query={query} intent={intent} on={on} walletPubkey={wallet.identity!.chainPubkey} />,
    'events': <EventLogPanel on={on} />,
  };

  return (
    <PageShell
      identity={wallet.identity!}
      onDisconnect={wallet.disconnect}
      section={section}
      onSectionChange={setSection}
    >
      {panels[section]}
    </PageShell>
  );
}
