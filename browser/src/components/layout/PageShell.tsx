import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import type { Section } from '../../lib/types';
import { WalletHeader } from './WalletHeader';

interface PageShellProps {
  identity: PublicIdentity;
  onDisconnect: () => void;
  section: Section;
  onSectionChange: (s: Section) => void;
  children: React.ReactNode;
}

interface NavItem { key: Section; label: string }

const QUERIES: NavItem[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'assets', label: 'Assets' },
  { key: 'balance', label: 'Balance' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'history', label: 'History' },
  { key: 'resolve', label: 'Resolve' },
];
const INTENTS: NavItem[] = [
  { key: 'send', label: 'Send' },
  { key: 'dm', label: 'DM' },
  { key: 'payment-request', label: 'Pay Request' },
  { key: 'receive', label: 'Receive' },
  { key: 'sign-message', label: 'Sign Message' },
  { key: 'mint', label: 'Mint' },
];
const CHAT: NavItem[] = [
  { key: 'chat', label: 'Chat' },
];
const EVENTS: NavItem[] = [
  { key: 'events', label: 'Event Log' },
];

function NavGroup({ title, color, items, active, onSelect }: {
  title: string; color: string; items: NavItem[]; active: Section; onSelect: (s: Section) => void;
}) {
  return (
    <div className="mb-4">
      <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${color}`}>{title}</div>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onSelect(item.key)}
          className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors ${
            active === item.key
              ? 'bg-orange-500/10 text-orange-400 border-l-2 border-orange-500 font-medium'
              : 'text-white/55 hover:bg-white/6 hover:text-white border-l-2 border-transparent'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PageShell({ identity, onDisconnect, section, onSectionChange, children }: PageShellProps) {
  return (
    <div className="flex flex-col h-screen bg-(--bg-root)">
      <WalletHeader identity={identity} onDisconnect={onDisconnect} />

      {/* Mobile horizontal nav */}
      <div className="lg:hidden border-b border-white/8 bg-(--bg-surface) overflow-x-auto">
        <div className="flex gap-1 px-3 py-2 min-w-max">
          {[...QUERIES, ...INTENTS, ...CHAT, ...EVENTS].map((item) => (
            <button
              key={item.key}
              onClick={() => onSectionChange(item.key)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                section === item.key
                  ? 'bg-orange-500 text-white font-medium'
                  : 'bg-white/6 text-white/55 hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-48 shrink-0 bg-(--bg-surface) border-r border-white/8 overflow-y-auto py-4">
          <NavGroup title="Queries" color="text-blue-500" items={QUERIES} active={section} onSelect={onSectionChange} />
          <NavGroup title="Intents" color="text-orange-500" items={INTENTS} active={section} onSelect={onSectionChange} />
          <NavGroup title="Chat" color="text-green-500" items={CHAT} active={section} onSelect={onSectionChange} />
          <NavGroup title="Events" color="text-purple-500" items={EVENTS} active={section} onSelect={onSectionChange} />
        </aside>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
