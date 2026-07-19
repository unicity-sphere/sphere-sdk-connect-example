/**
 * DEV HELPER — not part of the bot's runtime behavior.
 *
 * Boots the bot's own Sphere wallet against the real testnet2 network and
 * prints the resulting identity, then exits. Used to verify `createBotSphere()`
 * (Task 2 of the own-wallet bot plan) against the live aggregator/Nostr —
 * there is no unit test for `sphere.ts` since it's an integration boot, not
 * pure logic (see `.superpowers/sdd/task-b2-brief.md`).
 *
 * Run: `npx tsx src/smoke.ts`
 */
import { createBotSphere } from './sphere';

async function main() {
  const { sphere, identity, receivesPayments } = await createBotSphere();
  console.log('Bot identity:', identity);
  console.log('receivesPayments (wallet-api mailbox rail composed):', receivesPayments);
  await sphere.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke check failed:', err);
  process.exit(1);
});
