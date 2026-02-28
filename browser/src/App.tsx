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
      return <div className="min-h-screen bg-gray-50" />;
    }
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
