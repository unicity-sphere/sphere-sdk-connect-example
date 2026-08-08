/**
 * Bot runtime behavior — the bot's OWN Sphere wallet (booted via
 * `createBotSphere()`) wired up to: DM auto-reply, a one-time self-mint
 * float, incoming-transfer logging, and a small stdin command loop for a
 * money-safe demo `send`.
 *
 * SDK surface used here, verified against `@unicitylabs/sphere-sdk` **0.14.2**:
 *
 * - `sphere.payments` is the payments-v2 facade. The members used below:
 *     `assets(coinId?): Promise<Asset[]>`   — the balance view (grouped by coin)
 *     `mint(coinIdHex, amount: bigint): Promise<MintResult>`  — self-mint
 *     `send(req): Promise<TransferResult>`  — { recipient, amount, coinId, memo? }
 *   `mint` takes a **bigint**, not a base-unit string, so `toBaseUnits()`'s
 *   string result must be wrapped in `BigInt(...)`. It resolves to
 *   `{ success: false, error }` for ordinary failures rather than throwing,
 *   but can still throw for exceptional ones — hence both checks below.
 * - `TransferResult.deliveryPending === true` means "sent, delivery pending":
 *   the source is terminally spent and the recipient's copy will land later.
 *   That is a SUCCESS. Never resend it.
 * - `mayBeCommitted(err)` (`./sendSafety`) is true for the typed error codes
 *   whose spend may already be on-chain (`CERTIFICATION_UNCONFIRMED`,
 *   `SEND_SYNC_PENDING`, `SEND_PARTIALLY_COMPLETED`, the checkpoint codes …).
 *   It wraps the SDK's `isPossiblyCommittedSendOutcome` with a duck-typed
 *   fallback — see that file for why. The correct recovery is
 *   `payments.resumeNow()`, which replays the SAME intent — never a fresh
 *   `send()`, which would spend a different source and pay the recipient twice.
 * - `sphere.on('transfer:incoming', …)` — unchanged across the flip.
 *   `sphere.on('transfer:updated', …)` is the current lifecycle event; it
 *   replaces the old `transfer:confirmed` / `transfer:failed` pair.
 * - `sphere.communications.onDirectMessage(handler)` / `.sendDM(to, content)`
 *   — DMs still ride Nostr; only money moved to wallet-api.
 */
import readline from 'readline';
import {
  type Asset,
  type DirectMessage,
  type IncomingTransfer,
  type TransferResult,
} from '@unicitylabs/sphere-sdk';
import { createBotSphere } from './sphere';
import { mayBeCommitted } from './sendSafety';
import { fromBaseUnits, resolveCoin, toBaseUnits } from './coins';

const MINT_SYMBOL = 'UCT';
const MINT_AMOUNT_HUMAN = '100';

/**
 * `Asset.totalAmount` is in BASE units — `fromBaseUnits` puts the decimal point back.
 *
 * Falls back to the raw base-unit string if the coin's `decimals` is missing or
 * nonsensical. Printing a balance must never be able to kill the bot.
 */
function formatAssets(assets: Asset[]): string {
  if (assets.length === 0) return '(empty)';
  return assets
    .map((a) => {
      let amount: string;
      try {
        amount = fromBaseUnits(a.totalAmount, a.decimals);
      } catch {
        amount = `${a.totalAmount} (base units)`;
      }
      return `${amount} ${a.symbol} (${a.tokenCount} token(s))`;
    })
    .join('\n  ');
}

async function main() {
  const { sphere, identity } = await createBotSphere();
  console.log('Bot identity:', identity);

  // --- 1. DMs: echo back anything sent to the bot, skip self-DMs ---
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
    const result = await sphere.payments.mint(coinId, amount);
    if (result.success) {
      console.log(`[mint] self-minted ${MINT_AMOUNT_HUMAN} ${MINT_SYMBOL} (tokenId ${result.tokenId})`);
    } else {
      console.log(`[mint] self-mint unavailable: ${result.error}`);
    }
  } catch (err) {
    console.error('[mint] self-mint threw:', err instanceof Error ? err.message : err);
  }
  // `assets()` is a view over the wallet-api inventory, and the server credits a
  // fresh mint asynchronously — so this first read can legitimately come back empty
  // even though the mint above certified on-chain. `inventory:updated` is the signal
  // that the server's view caught up; that is what a UI refreshes on.
  console.log('[balance]\n  ' + formatAssets(await sphere.payments.assets()));

  // Two inventory updates in flight means two overlapping assets() reads, which can
  // resolve out of order — printing a stale balance AFTER a fresher one. The epoch
  // guard drops any result that a later read already superseded. A UI refreshing on
  // this event needs the same rule.
  let balanceEpoch = 0;
  sphere.on('inventory:updated', () => {
    const epoch = ++balanceEpoch;
    void sphere.payments
      .assets()
      .then((assets) => {
        if (epoch !== balanceEpoch) return; // superseded by a newer read
        console.log('[balance]\n  ' + formatAssets(assets));
      })
      .catch((err) => console.error('[balance] read failed:', err instanceof Error ? err.message : err));
  });

  // --- 3. Incoming transfers (tokens are delivered to the wallet-api mailbox) ---
  sphere.on('transfer:incoming', (t: IncomingTransfer) => {
    console.log(`[receive] incoming transfer ${t.id} from ${t.senderNametag ?? t.senderPubkey}`);
    sphere.communications.sendDM(t.senderPubkey, 'thanks for the tokens!').catch((err) => {
      console.error('[receive] failed to send thank-you DM:', err instanceof Error ? err.message : err);
    });
  });

  // The current lifecycle event for anything this wallet sends, receives or
  // mints. It replaced transfer:confirmed / transfer:failed in 0.14.
  sphere.on('transfer:updated', (t: TransferResult) => {
    console.log(`[transfer] ${t.id} -> ${t.status}${t.deliveryPending ? ' (delivery pending)' : ''}`);
  });

  // The wallet-api session's connectivity. 'degraded'/'offline' means reads
  // may be stale and sends will queue — it is not a failure.
  sphere.on('connection:status', ({ status }) => {
    console.log(`[connection] ${status}`);
  });

  // --- 4. Demo command loop: send / balance / pending / resume / help / exit ---
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
              if (mayBeCommitted(err)) {
                console.log(
                  'spend may already be committed — do NOT re-send. ' +
                    'Run "resume" to replay the same intent.',
                );
              } else {
                console.error('Send failed:', err instanceof Error ? err.message : err);
              }
            }
            break;
          }
          case 'balance': {
            console.log('Balance:\n  ' + formatAssets(await sphere.payments.assets()));
            break;
          }
          case 'pending': {
            const pending = await sphere.payments.pendingTransfers();
            console.log(pending.length === 0 ? 'Nothing pending.' : JSON.stringify(pending, null, 2));
            break;
          }
          case 'resume': {
            // The ONLY safe retry for a possibly-committed send: it replays the
            // SAME intent (same transferId) instead of issuing a new spend.
            await sphere.payments.resumeNow();
            console.log('Resume pass complete.');
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
  pending                                   - Show transfers still converging
  resume                                    - Replay open intents (the safe retry — never re-sends)
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
