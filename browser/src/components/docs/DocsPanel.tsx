const REPOS: { name: string; description: string; url: string }[] = [
  {
    name: 'sphere-sdk',
    description: 'The SDK itself — Connect protocol, transports, types, and the CONNECT.md guide.',
    url: 'https://github.com/unicity-sphere/sphere-sdk',
  },
  {
    name: 'sphere-sdk-connect-example',
    description: 'This app. Every panel you see here is a small, readable source file.',
    url: 'https://github.com/unicity-sphere/sphere-sdk-connect-example',
  },
  {
    name: 'sphere-connect (Claude plugin)',
    description: 'Marketplace plugin that teaches Claude Code to build this same integration for you.',
    url: 'https://github.com/unicity-sphere/unicity-claude-marketplace/tree/main/plugins/sphere-connect',
  },
];

const SNIPPET = `npm install @unicitylabs/sphere-sdk

import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { SPHERE_NETWORKS, INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';

// 1. Connect — autoConnect picks the transport (iframe -> extension -> popup).
const { client, identity, disconnect } = await autoConnect({
  dapp: { name: 'My dApp', description: 'What it does', url: location.origin },
  network: SPHERE_NETWORKS.testnet2,
});

// 2. Read — queries need no approval.
const balance = await client.query('sphere_getBalance');

// 3. Act — intents open the wallet for user approval.
//    Amounts are BASE UNITS (an integer string), never human decimals.
const result = await client.intent(INTENT_ACTIONS.SEND, {
  to: '@alice',
  amount: '1000000000000000000',
  coinId: '<lowercase 64-hex coin id>',
});`;

export function DocsPanel() {
  return (
    <div className="space-y-4">
      <div className="admin-card p-5">
        <h2 className="text-lg font-semibold text-white mb-1">Integrating Sphere Connect</h2>
        <p className="text-xs text-white/45 mb-4">
          The whole integration is three moves: connect, query, intent. This app is a live reference for each one —
          pick a panel on the left to see it, then read that panel's source.
        </p>
        <pre className="p-3 rounded-xl text-[11px] leading-relaxed overflow-auto font-mono bg-white/3 border border-white/8 text-white/70">
          {SNIPPET}
        </pre>
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
          <p className="text-xs font-semibold text-amber-400">One rule worth more than the rest</p>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            A <code className="font-mono">send</code> can resolve with{' '}
            <code className="font-mono">deliveryPending: true</code> and no{' '}
            <code className="font-mono">transferId</code>. That is a success: the spend certified on-chain and
            delivery is queued for retry. Never re-send it — a second send spends a different token and pays twice.
            See the Send panel.
          </p>
        </div>
      </div>

      <div className="admin-card p-5">
        <h2 className="text-lg font-semibold text-white mb-1">Source</h2>
        <p className="text-xs text-white/45 mb-4">Everything here is open — read it, copy it, or have Claude write it.</p>
        <div className="space-y-2">
          {REPOS.map((repo) => (
            <a
              key={repo.url}
              href={repo.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block p-3 rounded-xl border border-white/8 hover:border-orange-400 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">
                  {repo.name}
                </span>
                <span className="text-white/30 text-xs">↗</span>
              </div>
              <p className="mt-0.5 text-xs text-white/45">{repo.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
