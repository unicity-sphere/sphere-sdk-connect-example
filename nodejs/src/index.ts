/**
 * CLI dApp Client — Connects to a Sphere wallet via WebSocket.
 *
 * Usage:
 *   1. Start mock server: npx tsx src/mock-wallet-server.ts
 *   2. Run client:        npx tsx src/index.ts
 */

import { ConnectClient, RPC_METHODS, INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';
import WebSocket from 'ws';
import readline from 'readline';

const WS_URL = process.argv[2] ?? 'ws://localhost:8765';

async function main() {
  console.log(`Connecting to wallet at ${WS_URL}...`);

  const transport = WebSocketTransport.createClient({
    url: WS_URL,
    createWebSocket: (url: string) => new WebSocket(url) as any,
    autoReconnect: false,
  });

  await transport.connect();

  const client = new ConnectClient({
    transport,
    dapp: {
      name: 'CLI Example',
      description: 'Sphere Connect Node.js demo',
      url: 'cli://local',
    },
  });

  const result = await client.connect();
  console.log('\nConnected!');
  console.log('Session:', client.session);
  console.log('Identity:', JSON.stringify(result.identity, null, 2));
  console.log('Permissions:', result.permissions.join(', '));

  // Subscribe to events
  client.on('transfer:incoming', (data) => {
    console.log('\n[EVENT] transfer:incoming:', JSON.stringify(data));
    showPrompt();
  });

  // Interactive CLI
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function showPrompt() {
    rl.question('\n> ', async (input) => {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();

      if (!cmd) {
        showPrompt();
        return;
      }

      try {
        switch (cmd) {
          case 'balance': {
            const balance = await client.query(RPC_METHODS.GET_BALANCE);
            console.log('Balance:', JSON.stringify(balance, null, 2));
            break;
          }
          case 'assets': {
            const assets = await client.query(RPC_METHODS.GET_ASSETS);
            console.log('Assets:', JSON.stringify(assets, null, 2));
            break;
          }
          case 'tokens': {
            const tokens = await client.query(RPC_METHODS.GET_TOKENS);
            console.log('Tokens:', JSON.stringify(tokens, null, 2));
            break;
          }
          case 'history': {
            const history = await client.query(RPC_METHODS.GET_HISTORY);
            console.log('History:', JSON.stringify(history, null, 2));
            break;
          }
          case 'identity': {
            const identity = await client.query(RPC_METHODS.GET_IDENTITY);
            console.log('Identity:', JSON.stringify(identity, null, 2));
            break;
          }
          case 'l1': {
            const l1 = await client.query(RPC_METHODS.L1_GET_BALANCE);
            console.log('L1 Balance:', JSON.stringify(l1, null, 2));
            break;
          }
          case 'resolve': {
            const identifier = parts[1];
            if (!identifier) {
              console.log('Usage: resolve @nametag');
              break;
            }
            const peer = await client.query(RPC_METHODS.RESOLVE, {
              identifier: identifier.startsWith('@') ? identifier : '@' + identifier,
            });
            console.log('Resolved:', JSON.stringify(peer, null, 2));
            break;
          }
          case 'send': {
            const to = parts[1];
            const amount = parts[2];
            const coinId = parts[3] ?? 'UCT';
            if (!to || !amount) {
              console.log('Usage: send @nametag amount [coinId]');
              break;
            }
            const sendResult = await client.intent(INTENT_ACTIONS.SEND, {
              to: to.startsWith('@') ? to : '@' + to,
              amount,
              coinId,
            });
            console.log('Send result:', JSON.stringify(sendResult, null, 2));
            break;
          }
          case 'dm': {
            const dmTo = parts[1];
            const message = parts.slice(2).join(' ');
            if (!dmTo || !message) {
              console.log('Usage: dm @nametag message text');
              break;
            }
            const dmResult = await client.intent(INTENT_ACTIONS.DM, {
              to: dmTo.startsWith('@') ? dmTo : '@' + dmTo,
              message,
            });
            console.log('DM result:', JSON.stringify(dmResult, null, 2));
            break;
          }
          case 'disconnect':
          case 'exit':
          case 'quit': {
            console.log('Disconnecting...');
            await client.disconnect();
            transport.destroy();
            rl.close();
            process.exit(0);
          }
          case 'help': {
            console.log(`
Commands:
  balance          - Get L3 balance
  assets           - Get asset list
  tokens           - Get token list
  history          - Get transaction history
  identity         - Get wallet identity
  l1               - Get L1 balance
  resolve @tag     - Resolve a nametag
  send @to amt [coin] - Send tokens (intent)
  dm @to message   - Send DM (intent)
  disconnect       - Disconnect and exit
  help             - Show this help
`);
            break;
          }
          default:
            console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
        }
      } catch (err) {
        console.error('Error:', err instanceof Error ? err.message : err);
      }

      showPrompt();
    });
  }

  console.log('\nType "help" for available commands.');
  showPrompt();
}

main().catch((err) => {
  console.error('Failed to connect:', err.message);
  process.exit(1);
});
