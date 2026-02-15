/**
 * Mock Wallet Server — Standalone WS server for testing the Node.js Connect client.
 *
 * Run: npx tsx src/mock-wallet-server.ts
 */

import { ConnectHost, PERMISSION_SCOPES } from '@unicitylabs/sphere-sdk/connect';
import type { DAppMetadata, PermissionScope } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';

// Mock Sphere object matching the SphereInstance interface expected by ConnectHost
const mockSphere = {
  identity: {
    chainPubkey: '02abc123def456789012345678901234567890123456789012345678901234567890',
    l1Address: 'alpha1testmockaddress',
    directAddress: 'DIRECT://mock-test-address',
    nametag: 'mock-wallet',
  },
  payments: {
    getBalance: (_coinId?: string) => [
      { coinId: 'UCT', totalAmount: '5000000', symbol: 'UCT' },
    ],
    getAssets: async (_coinId?: string) => [
      { coinId: 'UCT', symbol: 'UCT', totalAmount: '5000000', tokenCount: 3 },
    ],
    getFiatBalance: async () => 25.50,
    getTokens: (_filter?: unknown) => [
      { id: 'tok-1', coinId: 'UCT', amount: '2000000' },
      { id: 'tok-2', coinId: 'UCT', amount: '3000000' },
    ],
    getHistory: () => [
      { type: 'sent', amount: '1000', coinId: 'UCT', timestamp: Date.now() - 3600000 },
      { type: 'received', amount: '5000', coinId: 'UCT', timestamp: Date.now() - 7200000 },
    ],
    l1: {
      getBalance: async () => ({ confirmed: '100000', total: '100000' }),
      getHistory: async () => [],
    },
  },
  resolve: async (identifier: string) => ({
    nametag: identifier.replace('@', ''),
    chainPubkey: '03fedcba0987654321',
    l1Address: 'alpha1resolved',
    directAddress: 'DIRECT://resolved',
    transportPubkey: 'aa00bb11',
  }),
  on: () => () => {}, // no-op event subscription
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
      return { result: { success: true, action, timestamp: Date.now() } };
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
