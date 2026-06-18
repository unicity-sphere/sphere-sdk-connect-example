/**
 * Mock Wallet Server — Standalone WS server for testing the Node.js Connect client.
 *
 * Run: npx tsx src/mock-wallet-server.ts
 */

import { ConnectHost, PERMISSION_SCOPES } from '@unicitylabs/sphere-sdk/connect';
import type { DAppMetadata, PermissionScope } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';

const now = Date.now();

// Mock Sphere object matching the SphereInstance interface expected by ConnectHost
const mockSphere = {
  networkId: 4,
  identity: {
    chainPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
    directAddress: 'DIRECT://abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    nametag: 'alice',
  },
  payments: {
    getBalance: (_coinId?: string) => [
      {
        coinId: 'UCT', symbol: 'UCT', name: 'Unicity Token', decimals: 8,
        totalAmount: '500000000', tokenCount: 3,
        confirmedAmount: '300000000', unconfirmedAmount: '200000000',
        confirmedTokenCount: 2, unconfirmedTokenCount: 1,
      },
      {
        coinId: 'USDU', symbol: 'USDU', name: 'USD Unicity', decimals: 6,
        totalAmount: '1000000000', tokenCount: 1,
        confirmedAmount: '1000000000', unconfirmedAmount: '0',
        confirmedTokenCount: 1, unconfirmedTokenCount: 0,
      },
    ],
    getAssets: async (_coinId?: string) => [
      {
        coinId: 'UCT', symbol: 'UCT', name: 'Unicity Token', decimals: 8,
        iconUrl: null, totalAmount: '500000000', tokenCount: 3,
        confirmedAmount: '300000000', unconfirmedAmount: '200000000',
        confirmedTokenCount: 2, unconfirmedTokenCount: 1,
        priceUsd: 0.051, priceEur: 0.047, change24h: 2.4,
        fiatValueUsd: 2.55, fiatValueEur: 2.35,
      },
      {
        coinId: 'USDU', symbol: 'USDU', name: 'USD Unicity', decimals: 6,
        iconUrl: null, totalAmount: '1000000000', tokenCount: 1,
        confirmedAmount: '1000000000', unconfirmedAmount: '0',
        confirmedTokenCount: 1, unconfirmedTokenCount: 0,
        priceUsd: 1.0, priceEur: 0.92, change24h: 0.01,
        fiatValueUsd: 1000.0, fiatValueEur: 920.0,
      },
    ],
    getFiatBalance: async () => 1002.55,
    getTokens: (_filter?: unknown) => [
      {
        id: 'tok-abc123def456', coinId: 'UCT', symbol: 'UCT', name: 'Unicity Token',
        decimals: 8, amount: '200000000', status: 'confirmed',
        createdAt: now - 86400000, updatedAt: now - 3600000,
      },
      {
        id: 'tok-789ghi012jkl', coinId: 'UCT', symbol: 'UCT', name: 'Unicity Token',
        decimals: 8, amount: '100000000', status: 'confirmed',
        createdAt: now - 43200000, updatedAt: now - 7200000,
      },
      {
        id: 'tok-mno345pqr678', coinId: 'UCT', symbol: 'UCT', name: 'Unicity Token',
        decimals: 8, amount: '200000000', status: 'submitted',
        createdAt: now - 1800000, updatedAt: now - 600000,
      },
      {
        id: 'tok-stu901vwx234', coinId: 'USDU', symbol: 'USDU', name: 'USD Unicity',
        decimals: 6, amount: '1000000000', status: 'confirmed',
        createdAt: now - 172800000, updatedAt: now - 86400000,
      },
    ],
    getHistory: () => [
      {
        id: 'h1', type: 'SENT', amount: '100000000', coinId: 'UCT', symbol: 'UCT',
        timestamp: now - 3600000, recipientNametag: 'bob', transferId: 'xfer-001',
      },
      {
        id: 'h2', type: 'RECEIVED', amount: '500000000', coinId: 'UCT', symbol: 'UCT',
        timestamp: now - 7200000, senderPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
        senderNametag: 'charlie',
      },
      {
        id: 'h3', type: 'MINT', amount: '1000000000', coinId: 'USDU', symbol: 'USDU',
        timestamp: now - 86400000,
      },
    ],
  },
  resolve: async (identifier: string) => ({
    nametag: identifier.replace('@', ''),
    chainPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
    directAddress: 'DIRECT://fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
    transportPubkey: 'aa00bb11cc22dd33ee44ff5566778899aabbccddeeff00112233445566778899',
  }),
  on: () => () => {}, // no-op event subscription
  communications: {
    getConversations: () => {
      const convos = new Map();
      convos.set('03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321', [
        {
          id: 'dm-1', senderPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
          senderNametag: 'bob', recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
          recipientNametag: 'alice', content: 'Hey Alice, how are you?',
          timestamp: now - 7200000, isRead: true,
        },
        {
          id: 'dm-2', senderPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
          senderNametag: 'alice', recipientPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
          recipientNametag: 'bob', content: 'Hi Bob! I am good, thanks!',
          timestamp: now - 3600000, isRead: true,
        },
        {
          id: 'dm-3', senderPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
          senderNametag: 'bob', recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
          recipientNametag: 'alice', content: 'Want to test the new Connect protocol?',
          timestamp: now - 1800000, isRead: false,
        },
      ]);
      convos.set('04aabbcc112233445566778899001122334455667788990011223344556677889900', [
        {
          id: 'dm-4', senderPubkey: '04aabbcc112233445566778899001122334455667788990011223344556677889900',
          senderNametag: 'charlie', recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
          recipientNametag: 'alice', content: 'Sent you some UCT!',
          timestamp: now - 86400000, isRead: true,
        },
      ]);
      return convos;
    },
    getConversationPage: (peerPubkey: string, _options?: { limit?: number; before?: number }) => {
      const isBob = peerPubkey.startsWith('03fed');
      return {
        messages: isBob ? [
          {
            id: 'dm-1', senderPubkey: peerPubkey, senderNametag: 'bob',
            recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
            recipientNametag: 'alice', content: 'Hey Alice, how are you?',
            timestamp: now - 7200000, isRead: true,
          },
          {
            id: 'dm-2', senderPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
            senderNametag: 'alice', recipientPubkey: peerPubkey,
            recipientNametag: 'bob', content: 'Hi Bob! I am good, thanks!',
            timestamp: now - 3600000, isRead: true,
          },
          {
            id: 'dm-3', senderPubkey: peerPubkey, senderNametag: 'bob',
            recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
            recipientNametag: 'alice', content: 'Want to test the new Connect protocol?',
            timestamp: now - 1800000, isRead: false,
          },
        ] : [
          {
            id: 'dm-4', senderPubkey: peerPubkey, senderNametag: 'charlie',
            recipientPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
            recipientNametag: 'alice', content: 'Sent you some UCT!',
            timestamp: now - 86400000, isRead: true,
          },
        ],
        hasMore: false,
        oldestTimestamp: isBob ? now - 7200000 : now - 86400000,
      };
    },
    getUnreadCount: (peerPubkey?: string) => peerPubkey?.startsWith('03fed') ? 1 : peerPubkey ? 0 : 1,
    markAsRead: async (_messageIds: string[]) => { /* no-op */ },
    sendDM: async (recipient: string, content: string) => ({
      id: `msg-${Date.now()}`,
      senderPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
      senderNametag: 'alice',
      recipientPubkey: '03fedcba09876543210fedcba09876543210fedcba09876543210fedcba0987654321',
      recipientNametag: recipient.replace('@', ''),
      content,
      timestamp: Date.now(),
      isRead: false,
    }),
  },
};

const PORT = 8765;

async function main() {
  const transport = WebSocketTransport.createServer({ port: PORT });
  await transport.start();

  console.log(`Mock wallet server listening on ws://localhost:${PORT}`);

  const host = new ConnectHost({
    sphere: mockSphere,
    transport,
    onConnectionRequest: async (dapp: DAppMetadata, requestedPermissions: PermissionScope[]) => {
      console.log(`\nConnection request from: ${dapp.name} (${dapp.url})`);
      console.log(`Requested permissions: ${requestedPermissions.join(', ')}`);
      console.log('Auto-approving...\n');
      return {
        approved: true,
        grantedPermissions: Object.values(PERMISSION_SCOPES),
      };
    },
    onIntent: async (action: string, params: Record<string, unknown>) => {
      console.log(`\nIntent received: ${action}`);
      console.log('Params:', JSON.stringify(params, null, 2));
      console.log('Auto-approving...\n');

      switch (action) {
        case 'send':
          return {
            result: {
              id: `xfer-${Date.now()}`, status: 'delivered',
              tokens: [{ id: `tok-new-${Date.now()}`, coinId: params.coinId ?? 'UCT', amount: params.amount, status: 'transferring' }],
              tokenTransfers: [{ sourceTokenId: 'tok-abc123def456', method: 'direct' }],
            },
          };
        case 'mint':
          return {
            result: {
              tokenId: 'aa'.repeat(32),
              coinId: params.coinId,
              amount: params.amount,
            },
          };
        case 'dm':
          return { result: { sent: true, messageId: `msg-${Date.now()}`, timestamp: Date.now() } };
        case 'payment_request':
          return { result: { success: true, requestId: `pr-${Date.now()}`, createdAt: Date.now() } };
        case 'receive':
          return {
            result: {
              transfers: [{
                id: 'inc-1', senderPubkey: '03fed...', senderNametag: 'charlie',
                tokens: [{ id: 'tok-inc1', coinId: 'UCT', amount: '50000000' }],
                receivedAt: Date.now(),
              }],
            },
          };
        case 'sign_message':
          return { result: { signature: '3045022100abcdef...', message: params.message, publicKey: '02abc123...' } };
        default:
          return { result: { success: true, action, timestamp: Date.now() } };
      }
    },
  } as any);

  console.log('Waiting for dApp connections...');
  console.log('Press Ctrl+C to stop.\n');

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    host.destroy();
    transport.destroy();
    process.exit(0);
  });
}

main().catch(console.error);
