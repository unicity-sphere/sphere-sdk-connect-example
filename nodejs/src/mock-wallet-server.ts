/**
 * Mock Wallet Server — Standalone WS server for testing the Node.js Connect client.
 *
 * Run: npx tsx src/mock-wallet-server.ts
 */

import { ConnectHost, PERMISSION_SCOPES } from '@unicitylabs/sphere-sdk/connect';
import type { DAppMetadata, LockedRequestContext, PermissionScope } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';
import readline from 'readline';
import { mockSphere } from './mockSphere';

const PORT = 8765;

/**
 * What a real wallet renders as a PASSIVE badge in its permanent chrome: "N requests waiting -
 * Unlock". A dApp request must never raise a credential surface, so this counter is the entire
 * permitted reaction. The password field appears only after a human clicks the badge.
 */
let waitingWhileLocked = 0;

async function main() {
  const transport = WebSocketTransport.createServer({ port: PORT });
  await transport.start();

  console.log(`Mock wallet server listening on ws://localhost:${PORT}`);

  const host = new ConnectHost({
    sphere: mockSphere,
    transport,
    // The transport-verified origin. A WS host has no browser origin, so the server's own
    // listen address is the honest answer — never the dApp-CLAIMED session.dapp.url.
    // Optional by design: with no credential prompt, no security decision depends on it.
    origin: `ws://localhost:${PORT}`,
    // Notify-only. The host has ALREADY answered WALLET_LOCKED (4009) in the same tick and
    // never waits for this callback. It must NOT raise a credential surface: a dApp request
    // may trigger a consent prompt, never a password field. Volume is bounded by the host's
    // own checkRateLimit(), so there is no coalescing, cooldown or cap here by design.
    onLockedRequest: (ctx: LockedRequestContext) => {
      waitingWhileLocked += 1;
      console.log(
        `\n[LOCKED] refused ${ctx.kind} "${ctx.name}" from ${ctx.origin ?? 'a connected app'} with 4009.`,
      );
      console.log(`         Badge would read: "${waitingWhileLocked} request(s) waiting — Unlock".`);
      console.log('         Type "unlock" to re-arm this mock wallet.\n');
    },
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
  console.log('Commands: lock | unlock | logout | unavailable | status | help | quit\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (line: string) => {
    switch (line.trim().toLowerCase()) {
      case 'lock':
        // ORDERING CONTRACT: setLocked() FIRST, then destroy the Sphere. The host drops its
        // Sphere reference here and freezes its snapshot; destroying first would leave
        // in-flight requests reading a dead instance. This mock has nothing to destroy, but
        // the order is the lesson.
        host.setLocked();
        console.log(`[wallet] locked — walletState=${host.walletState}; session preserved, requests answer 4009`);
        break;
      case 'unlock':
        waitingWhileLocked = 0;
        host.updateSphere(mockSphere);
        console.log(`[wallet] unlocked — walletState=${host.walletState}; same session, subscriptions re-armed, wallet:unlocked pushed`);
        break;
      case 'logout':
        host.revokeSession();
        console.log(`[wallet] logged out — walletState=${host.walletState}; session destroyed, wallet:disconnected pushed`);
        break;
      case 'unavailable':
        host.setUnavailable();
        console.log(`[wallet] unavailable — walletState=${host.walletState}; revoked, requests answer 4001 (unlocking cannot cure it)`);
        break;
      case 'status':
        console.log(
          `[wallet] walletState=${host.walletState} session=${host.getSession()?.id ?? 'none'} waiting=${waitingWhileLocked}`,
        );
        break;
      case 'help':
        console.log('  lock        — setLocked(): session preserved, requests answer WALLET_LOCKED (4009)');
        console.log('  unlock      — updateSphere(): same session resumes, wallet:unlocked pushed');
        console.log('  logout      — revokeSession(): session destroyed, wallet:disconnected pushed');
        console.log('  unavailable — setUnavailable(): Sphere gone for a non-lock reason, 4001');
        console.log('  status      — print walletState, session id and the waiting-request count');
        console.log('  quit        — shut down');
        break;
      case 'quit':
      case 'exit':
        rl.close();
        host.destroy();
        transport.destroy();
        process.exit(0);
        break;
      default:
        console.log('Unknown command. Type "help".');
    }
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    rl.close();
    host.destroy();
    transport.destroy();
    process.exit(0);
  });
}

main().catch(console.error);
