/**
 * Bot wallet init — the bot's OWN Sphere wallet (own keys, direct SDK usage,
 * not a Connect dApp).
 *
 * Verified against `@unicitylabs/sphere-sdk` **0.14.2** (the version this
 * package pins). The composition below is the ONLY supported one since the
 * payments-v2 flip:
 *
 *   createNodeProviders(...)          // storage + Nostr transport + oracle
 *     -> createWalletApiProviders(base, { baseUrl, network, deviceId? })
 *     -> Sphere.init({ ...providers })
 *
 * Two facts drive that shape:
 *
 * - **Money moves only through wallet-api custody.** Own-storage custody
 *   (`tokenStorage` / `tokensDir`, `FileTokenStorageProvider`,
 *   `IndexedDBTokenStorageProvider`) was DELETED in 0.14.0. `Sphere.init`
 *   throws `INVALID_CONFIG` when no `walletApi` config is present, so
 *   `WALLET_API_URL` is REQUIRED here — it is not an optional receive rail
 *   any more. See `sphere-sdk/docs/MIGRATION-PAYMENTS-V2.md` §3.
 * - **The payments composition is single-network.** `walletApi.network` must
 *   equal the network the providers/engine run on, or init throws
 *   `INVALID_CONFIG`. Both come from the one `TESTNET2` constant below.
 *
 * `network` on both factories is the plain network key (`'testnet2'`), NOT the
 * `SPHERE_NETWORKS.testnet2` object — that object is the Connect-protocol
 * network descriptor a dApp hands to `ConnectClient`, which this bot is not.
 *
 * Local `StorageProvider` state (mnemonic, keys, identity, nametag cache) is
 * unchanged and still lives on disk under `dataDir`. Only *token custody*
 * moved to the server.
 *
 * Bootstrap-init note: `createNodeProviders` accepts an empty `oracle.apiKey`
 * and never validates it at construction — it only affects request headers
 * later. That matters because the wallet must exist before it can sign the SGW
 * challenge that provisions a key. So the bot boots with whatever key it has
 * (possibly `''`), resolves the real one, then calls
 * `sphere.setOracleApiKey()`, which re-keys the live oracle and rebuilds the
 * token engine in place — the payments facade re-reads the engine per
 * operation, so no restart is needed.
 */
import 'dotenv/config';
import { Sphere, type Identity } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import { resolveAggregatorKey } from './aggregatorKey';

const TESTNET2 = 'testnet2' as const;

export interface BotSphere {
  sphere: Sphere;
  identity: Identity;
}

/**
 * Boot the bot's own Sphere wallet against testnet2.
 *
 * - `WALLET_API_URL` — **required**. The wallet-api instance that holds the
 *   bot's token inventory and mailbox (e.g.
 *   `https://wallet-api.unicity.network`). Money does not move without it.
 * - `AGGREGATOR_API_KEY` — OPTIONAL testnet2 aggregator key (see
 *   `.env.example`). Leave it unset and the bot provisions + persists its
 *   OWN per-wallet free-plan key from the SGW on first boot (reused on every
 *   later boot from `BOT_DATA_DIR/aggregator-key.json`) — see
 *   `resolveAggregatorKey` / `provisionAggregatorKey`.
 * - `BOT_MNEMONIC` — persists the bot's identity across runs. Leave empty to
 *   auto-generate a fresh one (printed once — save it to persist).
 * - `BOT_DATA_DIR` — local file storage root for keys/identity state
 *   (default `./.bot-data`; the wallet lives in `<dir>/wallet`).
 * - `BOT_DEVICE_ID` — optional stable device label for the wallet-api refresh
 *   token. Omit it and every run does a fresh challenge sign-in.
 */
export async function createBotSphere(): Promise<BotSphere> {
  const envKey = process.env.AGGREGATOR_API_KEY?.trim() || undefined;
  const botMnemonic = process.env.BOT_MNEMONIC || undefined;
  const botDataDir = process.env.BOT_DATA_DIR || './.bot-data';
  const deviceId = process.env.BOT_DEVICE_ID?.trim() || undefined;
  const walletApiUrl = process.env.WALLET_API_URL?.trim();

  if (!walletApiUrl) {
    throw new Error(
      'WALLET_API_URL is required: sphere-sdk 0.14 holds token custody in wallet-api, ' +
        'and Sphere.init throws INVALID_CONFIG without it. ' +
        'Set it in .env, e.g. WALLET_API_URL=https://wallet-api.unicity.network',
    );
  }

  const base = createNodeProviders({
    network: TESTNET2,
    dataDir: `${botDataDir}/wallet`,
    oracle: { apiKey: envKey ?? '' },
  });

  // Attaches the `walletApi` transport config Sphere.init composes the
  // payments vertical from. `network` must match the providers' network.
  const providers = createWalletApiProviders(base, {
    baseUrl: walletApiUrl,
    network: TESTNET2,
    deviceId,
  });

  const { sphere, generatedMnemonic } = await Sphere.init({
    ...providers,
    network: TESTNET2,
    mnemonic: botMnemonic,
    autoGenerate: !botMnemonic,
  });

  if (generatedMnemonic) {
    // eslint-disable-next-line no-console
    console.log(
      '\n=== GENERATED A NEW BOT MNEMONIC ===\n' +
        generatedMnemonic +
        '\nSAVE THIS — set BOT_MNEMONIC to persist this identity across runs.\n' +
        '=====================================\n',
    );
  }

  const identity = sphere.identity;
  if (!identity) {
    throw new Error('Sphere.init succeeded but sphere.identity is null');
  }

  const { apiKey, source } = await resolveAggregatorKey(sphere, {
    network: TESTNET2,
    dataDir: botDataDir,
    envKey,
  });
  // eslint-disable-next-line no-console
  console.log(`Aggregator key: ${source}`); // never log the key value itself
  if (source !== 'env') {
    // The env key (if any) was already the init-time oracle key; a saved or
    // freshly-provisioned key still needs to be applied to the live oracle.
    await sphere.setOracleApiKey(apiKey);
  }

  return { sphere, identity };
}
