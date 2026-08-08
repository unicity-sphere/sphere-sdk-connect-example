/**
 * DEV HELPER — not part of the bot's runtime behavior.
 *
 * Boots the bot's own Sphere wallet against the real testnet2 network and
 * prints the resulting identity, then exits. Used to verify `createBotSphere()`
 * against the live aggregator / wallet-api / Nostr — there is no unit test for
 * `sphere.ts` since it's an integration boot, not pure logic.
 *
 * Run: `npx tsx src/smoke.ts` (needs WALLET_API_URL in .env).
 */
import { createBotSphere } from './sphere';

async function main() {
  const { sphere, identity } = await createBotSphere();
  console.log('Bot identity:', identity);
  console.log('Assets:', await sphere.payments.assets());
  await sphere.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke check failed:', err);
  process.exit(1);
});
