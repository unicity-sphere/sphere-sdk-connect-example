/**
 * CLI dApp Client — Connects to a Sphere wallet via WebSocket.
 *
 * Usage:
 *   1. Start mock server: npx tsx src/mock-wallet-server.ts
 *   2. Run client:        npx tsx src/index.ts
 */

import { ConnectClient, ERROR_CODES, RPC_METHODS, INTENT_ACTIONS, SPHERE_NETWORKS, WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';
import { describeConnectFailure, isSameWallet } from './lockResume';
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
    network: SPHERE_NETWORKS.testnet2,
  });

  const result = await client.connect();
  console.log('\nConnected!');
  console.log('Session:', client.session);
  console.log('Identity:', JSON.stringify(result.identity, null, 2));
  console.log('Permissions:', result.permissions.join(', '));
  let connectedIdentity: PublicIdentity | null = result.identity;
  // Queries only. An intent is NEVER auto-resumed: it moves money and would fire with no fresh
  // user gesture, at the exact moment the wallet came back.
  let lastQuery: { method: string; params?: Record<string, unknown> } | null = null;

  async function runQuery(method: string, params?: Record<string, unknown>): Promise<unknown> {
    lastQuery = { method, params };
    return client.query(method, params);
  }

  if (result.locked) {
    console.log('\n[state] the wallet was LOCKED when we resumed — connected AND locked.');
    console.log('        Requests answer 4009 until you type "unlock" in the wallet.\n');
  }

  // Auto-pushed by ConnectHost — no sphere_subscribe needed for any of these.
  client.on(WALLET_EVENTS.LOCKED, () => {
    console.log(`\n[EVENT] wallet:locked — session preserved; requests answer ${ERROR_CODES.WALLET_LOCKED}`);
    showPrompt();
  });
  client.on(WALLET_EVENTS.UNLOCKED, (data: unknown) => {
    const next = (data as { identity?: PublicIdentity } | undefined)?.identity ?? null;
    if (!isSameWallet(connectedIdentity, next)) {
      connectedIdentity = next;
      console.log('\n[EVENT] wallet:unlocked — DIFFERENT wallet came back. Nothing resumed.');
      console.log('        New identity:', JSON.stringify(next));
      lastQuery = null;
      showPrompt();
      return;
    }
    // Nothing to re-subscribe: the host replayed every suspended subscription key before it
    // pushed this event.
    console.log('\n[EVENT] wallet:unlocked — same wallet, same session.');
    if (lastQuery) {
      const replay = lastQuery;
      client
        .query(replay.method, replay.params)
        .then((res) => console.log(`[resume] ${replay.method}:`, JSON.stringify(res, null, 2)))
        .catch((err) => console.error('[resume]', describeConnectFailure(err)))
        .finally(showPrompt);
      return;
    }
    showPrompt();
  });
  client.on(WALLET_EVENTS.DISCONNECTED, () => {
    console.log('\n[EVENT] wallet:disconnected — the session is gone. Re-run the client to re-handshake.');
    process.exit(0);
  });

  // Subscribe to events
  client.on('transfer:incoming', (data: unknown) => {
    console.log('\n[EVENT] transfer:incoming:', JSON.stringify(data));
    showPrompt();
  });
  client.on('message:dm', (data: unknown) => {
    console.log('\n[EVENT] message:dm:', JSON.stringify(data));
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
            const balance = await runQuery(RPC_METHODS.GET_BALANCE);
            console.log('Balance:', JSON.stringify(balance, null, 2));
            break;
          }
          case 'assets': {
            const assets = await runQuery(RPC_METHODS.GET_ASSETS);
            console.log('Assets:', JSON.stringify(assets, null, 2));
            break;
          }
          case 'fiat': {
            const fiat = await runQuery(RPC_METHODS.GET_FIAT_BALANCE);
            console.log('Fiat Balance:', JSON.stringify(fiat, null, 2));
            break;
          }
          case 'tokens': {
            const tokens = await runQuery(RPC_METHODS.GET_TOKENS);
            console.log('Tokens:', JSON.stringify(tokens, null, 2));
            break;
          }
          case 'history': {
            const history = await runQuery(RPC_METHODS.GET_HISTORY);
            console.log('History:', JSON.stringify(history, null, 2));
            break;
          }
          case 'identity': {
            const identity = await runQuery(RPC_METHODS.GET_IDENTITY);
            console.log('Identity:', JSON.stringify(identity, null, 2));
            break;
          }
          case 'resolve': {
            const identifier = parts[1];
            if (!identifier) {
              console.log('Usage: resolve @nametag');
              break;
            }
            const peer = await runQuery(RPC_METHODS.RESOLVE, {
              identifier: identifier.startsWith('@') ? identifier : '@' + identifier,
            });
            console.log('Resolved:', JSON.stringify(peer, null, 2));
            break;
          }
          case 'send': {
            const to = parts[1];
            const amount = parts[2];
            const coinId = parts[3];
            if (!to || !amount || !coinId) {
              console.log('Usage: send @nametag <amount-base-units> <coinId-hex>');
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
          case 'mint': {
            const mintCoinId = parts[1];
            const mintAmount = parts[2];
            if (!mintCoinId || !mintAmount) {
              console.log('Usage: mint <coinId> <amount>');
              break;
            }
            const mintResult = await client.intent(INTENT_ACTIONS.MINT, {
              coinId: mintCoinId,
              amount: mintAmount,
            });
            console.log('Mint result:', JSON.stringify(mintResult, null, 2));
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
          case 'pay': {
            const payTo = parts[1];
            const payAmount = parts[2];
            const payCoin = parts[3];
            const payMsg = parts.slice(4).join(' ') || undefined;
            if (!payTo || !payAmount || !payCoin) {
              console.log('Usage: pay @nametag <amount-base-units> <coinId-hex> [message]');
              break;
            }
            const payResult = await client.intent(INTENT_ACTIONS.PAYMENT_REQUEST, {
              to: payTo.startsWith('@') ? payTo : '@' + payTo,
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
          case 'conversations':
          case 'convos': {
            const convos = await runQuery(RPC_METHODS.GET_CONVERSATIONS);
            console.log('Conversations:', JSON.stringify(convos, null, 2));
            break;
          }
          case 'messages':
          case 'msgs': {
            const peer = parts[1];
            if (!peer) {
              console.log('Usage: messages <peerPubkey> [limit]');
              break;
            }
            const msgParams: Record<string, unknown> = { peerPubkey: peer };
            if (parts[2]) msgParams.limit = parseInt(parts[2]);
            const msgs = await runQuery(RPC_METHODS.GET_MESSAGES, msgParams);
            console.log('Messages:', JSON.stringify(msgs, null, 2));
            break;
          }
          case 'unread': {
            const unreadPeer = parts[1] || undefined;
            const unreadParams: Record<string, unknown> = {};
            if (unreadPeer) unreadParams.peerPubkey = unreadPeer;
            const unread = await runQuery(RPC_METHODS.GET_DM_UNREAD_COUNT, unreadParams);
            console.log('Unread:', JSON.stringify(unread, null, 2));
            break;
          }
          case 'read': {
            const ids = parts.slice(1);
            if (ids.length === 0) {
              console.log('Usage: read <messageId1> [messageId2] ...');
              break;
            }
            const readResult = await runQuery(RPC_METHODS.MARK_AS_READ, { messageIds: ids });
            console.log('Marked as read:', JSON.stringify(readResult, null, 2));
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
    resolve @tag       - Resolve nametag/address to peer info

  INTENTS (require wallet approval)
    send @to <amount> <coinId>       - Send L3 tokens (amount in smallest units, coinId lowercase hex)
    mint <coinId> <amount>           - Self-mint a fungible token (coinId = lowercase hex)
    dm @to message                   - Send direct message
    pay @to <amount> <coinId> [msg]  - Send payment request (amount in smallest units, coinId lowercase hex)
    receive                          - Receive incoming tokens
    sign message text                - Sign a message

  CHAT (require dm:read permission)
    conversations                - List DM conversations
    messages <pubkey> [limit]    - Get messages with a peer
    unread [pubkey]              - Get unread message count
    read <id1> [id2] ...         - Mark messages as read

  OTHER
    disconnect                   - Disconnect and exit
    help                         - Show this help
    (lock the wallet with "lock" in the mock server: queries then fail with 4009,
     the session survives, "identity" still works from the frozen snapshot, and the
     last query auto-resumes on "unlock" — intents never do)
`);
            break;
          }
          default:
            console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
        }
      } catch (err) {
        console.error('Error:', describeConnectFailure(err));
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
