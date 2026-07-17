/**
 * Bot runtime behavior — the bot's OWN Sphere wallet (booted via
 * `createBotSphere()`, Task 2) wired up to: DM auto-reply, a one-time
 * self-mint float, optional incoming-transfer logging, and a small stdin
 * command loop for a money-safe demo `send`.
 *
 * SDK symbols/field names below are verified against `sphere-sdk` 0.11.14
 * source (this repo pins that exact version):
 *
 * - `sphere.communications` getter — `core/Sphere.ts:1388`.
 * - `communications.onDirectMessage(handler: (m: DirectMessage) => void): () => void`
 *   — `modules/communications/CommunicationsModule.ts:450`.
 * - `communications.sendDM(recipient: string, content: string): Promise<DirectMessage>`
 *   — `modules/communications/CommunicationsModule.ts:244`.
 * - `DirectMessage` — `{ id, senderPubkey, senderNametag?, recipientPubkey,
 *   recipientNametag?, content, timestamp, isRead }` — `types/index.ts:337-346`,
 *   re-exported from the SDK root via `index.ts:134` (`export * from './types'`).
 * - `sphere.payments` getter — `core/Sphere.ts:1382`.
 * - `payments.mintFungibleToken(coinIdHex: string, amount: bigint): Promise<
 *   { success: true; token: Token; tokenId: string } | { success: false; error: string }>`
 *   — `modules/payments/PaymentsModule.ts:4655-4667`. NOTE: `amount` is a
 *   `bigint`, not a base-unit string — `toBaseUnits()` (Task 1) returns a
 *   string, so it must be wrapped in `BigInt(...)`. This does NOT throw on
 *   an ordinary mint failure (e.g. no token engine) — it resolves to
 *   `{ success: false, error }` — confirmed against the real call site in
 *   `agentic-chatbot/packages/chess-bot/src/wallet.ts:137-146`, which checks
 *   `result.success` AND wraps the call in try/catch (it can still throw for
 *   genuinely exceptional errors). Mirrored here.
 * - `payments.getBalance(coinId?: string): Asset[]` — synchronous —
 *   `modules/payments/PaymentsModule.ts:3525-3527`.
 * - `payments.send(request: TransferRequest): Promise<TransferResult>` —
 *   `modules/payments/PaymentsModule.ts:1759-1762`. `TransferRequest` —
 *   `{ coinId, amount, recipient, memo? }` — `types/index.ts:143-156`.
 *   `TransferResult.deliveryPending?: boolean` — `types/index.ts:188` — true
 *   means "sent, delivery pending" (source is terminally spent, recipient
 *   delivery will land later) — a SUCCESS outcome, never resend.
 * - `sphere.on<T>(type: T, handler): () => void` — `core/Sphere.ts:3390`.
 *   `'transfer:incoming'` payload is `IncomingTransfer` — `{ id, senderPubkey,
 *   senderNametag?, tokens, memo?, receivedAt }` — `types/index.ts:193-200`,
 *   confirmed emitted by `PaymentsModule.ts:5239`.
 * - Money-safety guard: `isPossiblyCommittedSendOutcome(err: unknown): boolean`
 *   — `core/errors.ts:240-242` — true for `SphereError`s whose `code` is in
 *   the possibly-committed set, which ALREADY includes `'SEND_PARTIALLY_COMPLETED'`
 *   (`core/errors.ts:223-230`). Exported from the SDK root — `index.ts:51`
 *   (`export { ..., isPossiblyCommittedSendOutcome } from './core'`). The
 *   brief additionally asks for an explicit `err?.code === 'SEND_PARTIALLY_COMPLETED'`
 *   check — redundant for a real `PartialSendConflictError` (already covered
 *   above) but kept as a defensive belt-and-suspenders check for any
 *   non-`SphereError`-shaped rejection that happens to carry that code.
 * - `identity.chainPubkey` — `Identity` — `types/index.ts:30-37` — used to
 *   skip the bot's own outgoing DMs echoing back to itself.
 */
import readline from 'readline';
import { isPossiblyCommittedSendOutcome, type DirectMessage, type IncomingTransfer } from '@unicitylabs/sphere-sdk';
import { createBotSphere } from './sphere';
import { resolveCoin, toBaseUnits } from './coins';

const MINT_SYMBOL = 'UCT';
const MINT_AMOUNT_HUMAN = '100';

async function main() {
  const { sphere, identity, receivesPayments } = await createBotSphere();
  console.log('Bot identity:', identity);

  // --- 1. DMs (always): echo back anything sent to the bot, skip self-DMs ---
  sphere.communications.onDirectMessage(async (m: DirectMessage) => {
    console.log(`[dm] from ${m.senderNametag ?? m.senderPubkey}: ${m.content}`);
    if (m.senderPubkey === identity.chainPubkey) {
      return; // don't reply to ourselves (avoids an echo loop)
    }
    try {
      await sphere.communications.sendDM(m.senderPubkey, `echo: ${m.content}`);
    } catch (err) {
      console.error('[dm] failed to send echo reply:', err instanceof Error ? err.message : err);
    }
  });

  // --- 2. Self-mint a float, once on boot (best-effort — minting may be unavailable) ---
  try {
    const { coinId, decimals } = resolveCoin(MINT_SYMBOL);
    const amount = BigInt(toBaseUnits(MINT_AMOUNT_HUMAN, decimals));
    const result = await sphere.payments.mintFungibleToken(coinId, amount);
    if (result.success) {
      console.log(`[mint] self-minted ${MINT_AMOUNT_HUMAN} ${MINT_SYMBOL} (tokenId ${result.tokenId})`);
    } else {
      console.log(`[mint] self-mint unavailable: ${result.error}`);
    }
  } catch (err) {
    console.error('[mint] self-mint threw:', err instanceof Error ? err.message : err);
  }
  console.log('[balance]', JSON.stringify(sphere.payments.getBalance(), null, 2));

  // --- 3. Receive: only wired if the wallet-api mailbox rail was composed in ---
  if (receivesPayments) {
    sphere.on('transfer:incoming', (t: IncomingTransfer) => {
      console.log(`[receive] incoming transfer ${t.id} from ${t.senderNametag ?? t.senderPubkey}`);
      sphere.communications.sendDM(t.senderPubkey, 'thanks for the tokens!').catch((err) => {
        console.error('[receive] failed to send thank-you DM:', err instanceof Error ? err.message : err);
      });
    });
  } else {
    console.log('WALLET_API_URL not set — this bot will not receive tokens from the hosted wallet (see README).');
  }

  // --- 4. Demo command loop: send / balance / help / exit ---
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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
          case 'send': {
            const to = parts[1];
            const humanAmount = parts[2];
            const symbolOrId = parts[3];
            if (!to || !humanAmount || !symbolOrId) {
              console.log('Usage: send @to <human-amount> <symbolOrCoinId>');
              break;
            }
            const { coinId, decimals } = resolveCoin(symbolOrId);
            const amount = toBaseUnits(humanAmount, decimals);
            try {
              const result = await sphere.payments.send({ coinId, amount, recipient: to });
              if (result.deliveryPending) {
                console.log('sent, delivery pending');
              } else {
                console.log('Send result:', JSON.stringify(result, null, 2));
              }
            } catch (err) {
              if (isPossiblyCommittedSendOutcome(err) || (err as { code?: string } | undefined)?.code === 'SEND_PARTIALLY_COMPLETED') {
                console.log('spend may already be committed — do NOT retry');
              } else {
                console.error('Send failed:', err instanceof Error ? err.message : err);
              }
            }
            break;
          }
          case 'balance': {
            console.log('Balance:', JSON.stringify(sphere.payments.getBalance(), null, 2));
            break;
          }
          case 'exit':
          case 'quit': {
            console.log('Shutting down...');
            rl.close();
            await sphere.destroy();
            process.exit(0);
            break;
          }
          case 'help': {
            console.log(`
Commands:
  send @to <human-amount> <symbolOrCoinId>  - Send L3 tokens (money-safe: no auto-resend on a possibly-committed outcome)
  balance                                   - Show current balance
  help                                      - Show this help
  exit                                      - Shut down and exit
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

  console.log('\nBot is running. Type "help" for available commands.');
  showPrompt();
}

main().catch((err) => {
  console.error('Bot failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
