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
          case 'fiat': {
            const fiat = await client.query(RPC_METHODS.GET_FIAT_BALANCE);
            console.log('Fiat Balance:', JSON.stringify(fiat, null, 2));
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
          case 'l1history': {
            const limit = parts[1] ? parseInt(parts[1]) : undefined;
            const params = limit ? { limit } : undefined;
            const l1h = await client.query(RPC_METHODS.L1_GET_HISTORY, params);
            console.log('L1 History:', JSON.stringify(l1h, null, 2));
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
              recipient: to.startsWith('@') ? to : '@' + to,
              amount,
              coinId,
            });
            console.log('Send result:', JSON.stringify(sendResult, null, 2));
            break;
          }
          case 'l1send': {
            const l1to = parts[1];
            const l1amount = parts[2];
            if (!l1to || !l1amount) {
              console.log('Usage: l1send alpha1... amount');
              break;
            }
            const l1Result = await client.intent(INTENT_ACTIONS.L1_SEND, {
              to: l1to,
              amount: l1amount,
            });
            console.log('L1 Send result:', JSON.stringify(l1Result, null, 2));
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
              recipient: dmTo.startsWith('@') ? dmTo : '@' + dmTo,
              message,
            });
            console.log('DM result:', JSON.stringify(dmResult, null, 2));
            break;
          }
          case 'pay': {
            const payTo = parts[1];
            const payAmount = parts[2];
            const payCoin = parts[3] ?? 'UCT';
            const payMsg = parts.slice(4).join(' ') || undefined;
            if (!payTo || !payAmount) {
              console.log('Usage: pay @nametag amount [coinId] [message]');
              break;
            }
            const payResult = await client.intent(INTENT_ACTIONS.PAYMENT_REQUEST, {
              recipient: payTo.startsWith('@') ? payTo : '@' + payTo,
              amount: payAmount,
              coinId: payCoin,
              ...(payMsg ? { message: payMsg } : {}),
            });
            console.log('Payment request result:', JSON.stringify(payResult, null, 2));
            break;
          }
          case 'receive': {
            const recvResult = await client.intent(INTENT_ACTIONS.RECEIVE, {});
            console.log('Receive result:', JSON.stringify(recvResult, null, 2));
            break;
          }
          case 'sign': {
            const signMsg = parts.slice(1).join(' ');
            if (!signMsg) {
              console.log('Usage: sign message text');
              break;
            }
            const signResult = await client.intent(INTENT_ACTIONS.SIGN_MESSAGE, {
              message: signMsg,
            });
            console.log('Sign result:', JSON.stringify(signResult, null, 2));
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
  QUERIES
    identity           - Get wallet identity
    balance            - Get L3 balance
    assets             - Get asset list (with fiat values)
    fiat               - Get total fiat balance
    tokens             - Get individual token list
    history            - Get transaction history
    l1                 - Get L1 ALPHA balance
    l1history [limit]  - Get L1 transaction history
    resolve @tag       - Resolve nametag/address to peer info

  INTENTS (require wallet approval)
    send @to amt [coin]          - Send L3 tokens
    l1send alpha1... amount      - Send L1 ALPHA
    dm @to message               - Send direct message
    pay @to amt [coin] [message] - Send payment request
    receive                      - Receive incoming tokens
    sign message text            - Sign a message

  OTHER
    disconnect                   - Disconnect and exit
    help                         - Show this help
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
