/**
 * Bot wallet init — the bot's OWN Sphere wallet (own keys, direct SDK usage,
 * not a Connect dApp), with an optional wallet-api receive rail.
 *
 * SDK symbols/field names below are verified against
 * `sphere-sdk` 0.11.14 source (this repo pins that exact version):
 *
 * - `createNodeProviders(config)` — `impl/nodejs/index.ts:171`. `config.network`
 *   is REQUIRED (throws `INVALID_CONFIG` — `impl/nodejs/index.ts:192-195`).
 *   Storage dirs are `dataDir` / `tokensDir` (NodeProvidersConfig —
 *   `impl/nodejs/index.ts:99,104`), oracle key is `oracle.apiKey`
 *   (`impl/nodejs/index.ts:108`, consumed at :250-258).
 * - `createOwnStorageWalletApiProviders(base, config)` —
 *   `impl/shared/wallet-api/composition.ts:178`. This is the "Inventory
 *   Custody (Bring Your Own Storage)" preset (`docs/INTEGRATION.md:227-248`):
 *   it keeps `base`'s own `tokenStorage` (the file-based storage `createNodeProviders`
 *   already built) and adds ONLY `delivery` (wallet-api mailbox, custody
 *   `'external'` — zero server inventory writes on claim, composition.ts:183)
 *   + `walletApi` (the auth-session client). Deliberately NOT
 *   `createWalletApiProviders` (composition.ts:153): that "External Custody"
 *   preset REPLACES `tokenStorage` with a thin provider backed by the
 *   wallet-api server's own encrypted archive (docs/INTEGRATION.md:205-217) —
 *   the opposite of this bot's "own keys, own storage" identity described in
 *   `bot/README.md` and `bot/.env.example`. `WalletApiCompositionConfig`
 *   (composition.ts:84-110) takes `baseUrl` + `network` (plain `string`, e.g.
 *   `'testnet2'`) + optional `deviceId`; it has no `tokenStorage` field —
 *   own-storage custody works by simply not swapping `base.tokenStorage`.
 * - `network` fields on both factories above are a plain `NetworkType` /
 *   `string` (`'testnet2'`), NOT the `SPHERE_NETWORKS.testnet2` object
 *   (`{ id: 4, name: 'testnet2' }`, `constants.ts:460-462`). That object is
 *   the Connect-protocol network descriptor (`ConnectClient`/`autoConnect`,
 *   `docs/CONNECT.md:41-57`) — passing it here would hand an object where a
 *   string key is expected. Testnet2's networkId (4) is reachable purely via
 *   the string network key; `SPHERE_NETWORKS` is intentionally unused here.
 * - `Sphere.init(options): Promise<SphereInitResult>` — `core/Sphere.ts:711`.
 *   `SphereInitOptions` (`core/Sphere.ts:362-434`) takes the provider bundle
 *   spread directly (`storage`, `transport`, `oracle`, `delivery?`, `walletApi?`,
 *   `tokenStorage?`, ...) plus `mnemonic?: string` (:384), `autoGenerate?: boolean`
 *   (:386) and `network?: NetworkType` (:398). Mirrors the canonical
 *   `docs/QUICKSTART-NODEJS.md:149-192` shape: `Sphere.init({ ...providers, ... })`.
 *   `SphereInitResult` (`core/Sphere.ts:436-444`) exposes `sphere`, `created`
 *   and `generatedMnemonic?` (only set when `autoGenerate` produced a new one).
 * - `sphere.identity` getter (`core/Sphere.ts:1418-1424`) returns `Identity | null`
 *   (`types/index.ts:30-37`, re-exported from the SDK root via `index.ts:134`
 *   `export * from './types'`): `{ chainPubkey, directAddress?, ipnsName?, nametag? }`.
 * - `sphere.setOracleApiKey(apiKey): Promise<void>` — `core/Sphere.ts:1584`, public.
 *   Re-keys the LIVE oracle + rebuilds the token engine without a full
 *   Sphere rebuild (transport/socket/discovery stay up) — used below to apply
 *   a saved/provisioned key discovered AFTER init.
 * - Bootstrap-init finding (verified against `oracle/UnicityAggregatorProvider.ts`):
 *   `UnicityAggregatorProviderConfig.apiKey` is `apiKey?: string` (:37) and
 *   defaults to `''` at construction (:84, `config.apiKey ?? ''`) — the
 *   provider does NOT validate/require a non-empty key at construction time,
 *   it only affects request headers later. `createNodeProviders` /
 *   `Sphere.init` never throw on an empty oracle key. So booting with
 *   `oracle: { apiKey: '' }` when there's no env key yet is safe: init
 *   succeeds, `sphere.deriveAddress(0)` + `signMessage` (pure local crypto,
 *   no oracle involved) can sign the SGW provisioning challenge, and
 *   `setOracleApiKey` re-keys the live oracle once a key is resolved.
 */
import 'dotenv/config';
import { Sphere, type Identity } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createOwnStorageWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import { resolveAggregatorKey } from './aggregatorKey';

const TESTNET2 = 'testnet2' as const;

export interface BotSphere {
  sphere: Sphere;
  identity: Identity;
  /** True when the wallet-api mailbox delivery rail was composed in (WALLET_API_URL set). */
  receivesPayments: boolean;
}

/**
 * Boot the bot's own Sphere wallet against testnet2.
 *
 * - `AGGREGATOR_API_KEY` — OPTIONAL testnet2 aggregator key (see
 *   `.env.example`). Leave it unset and the bot provisions + persists its
 *   OWN per-wallet free-plan key from the SGW on first boot (reused on every
 *   later boot from `BOT_DATA_DIR/aggregator-key.json`) — see
 *   `resolveAggregatorKey` / `provisionAggregatorKey`.
 * - `BOT_MNEMONIC` — persists the bot's identity across runs. Leave empty to
 *   auto-generate a fresh one (printed once — save it to persist).
 * - `BOT_DATA_DIR` — local file storage root for wallet + token data
 *   (default `./.bot-data`); split into `<dir>/wallet` and `<dir>/tokens`.
 * - `WALLET_API_URL` — optional. When set, composes the wallet-api mailbox
 *   delivery rail (own-storage custody preset) so the bot can RECEIVE tokens
 *   sent from a hosted Sphere wallet, which deliver via that mailbox, not
 *   Nostr. Left unset, the bot can still send + DM over Nostr, just not
 *   receive mailbox-delivered payments.
 */
export async function createBotSphere(): Promise<BotSphere> {
  const envKey = process.env.AGGREGATOR_API_KEY?.trim() || undefined;
  const botMnemonic = process.env.BOT_MNEMONIC || undefined;
  const botDataDir = process.env.BOT_DATA_DIR || './.bot-data';
  const walletApiUrl = process.env.WALLET_API_URL || undefined;

  // Bootstrap init: the wallet must exist (to sign the SGW provisioning
  // challenge with sphere.deriveAddress(0)) before a key can be resolved,
  // but createNodeProviders wants SOME oracle apiKey up front. An empty
  // string is safe here — see the bootstrap-init finding in the file-header
  // comment above; it's re-keyed via setOracleApiKey below once resolved.
  const base = createNodeProviders({
    network: TESTNET2,
    dataDir: `${botDataDir}/wallet`,
    tokensDir: `${botDataDir}/tokens`,
    oracle: { apiKey: envKey ?? '' },
  });

  const receivesPayments = Boolean(walletApiUrl);
  const providers = walletApiUrl
    ? createOwnStorageWalletApiProviders(base, { baseUrl: walletApiUrl, network: TESTNET2 })
    : base;

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

  return { sphere, identity, receivesPayments };
}
