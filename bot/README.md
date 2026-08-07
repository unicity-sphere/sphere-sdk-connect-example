# Sphere Connect — Own-Wallet Bot Example

A Node bot that runs its **own** Sphere wallet: its own keys, its own
identity, direct SDK usage. It boots a real `Sphere` instance against
**testnet2** the same way a wallet app would — there is no Connect protocol
involved anywhere in this example.

> **Token custody lives in wallet-api.** sphere-sdk 0.14 deleted own-storage
> custody, so `WALLET_API_URL` is now **required** — see
> [Custody: wallet-api is required](#custody-wallet-api-is-required).

This is the opposite shape from the `browser/` and `nodejs/` examples in this
repo, which are **dApps** that connect *to* someone else's already-running
wallet over Connect (`ConnectClient` + a transport). This bot doesn't connect
to a wallet — **it *is* the wallet.**

What it does once running:
- Replies to any incoming Nostr DM with `echo: <message>`.
- Self-mints 100 `UCT` on boot as a starting balance (best-effort — logs a
  message instead of failing if minting isn't available).
- Exposes a small `send` / `balance` / `pending` / `resume` / `help` / `exit`
  command loop on stdin.
- Logs incoming token transfers and replies with a thank-you DM.
- Logs `transfer:updated`, `inventory:updated` and `connection:status` — the
  sphere-sdk 0.14 event names.

> `payments.assets()` reads the **wallet-api inventory**, which the server credits
> asynchronously. The balance printed immediately after the boot mint can legitimately
> be empty even though the mint certified on-chain; `inventory:updated` is the signal
> that the server view caught up, and the bot re-prints the balance on it. A UI
> should refresh on that event rather than polling.

## When to use this

Reach for this shape when your agent should act **from its own wallet, with no
human approving each action** — it holds the keys and owns the funds.

Concrete examples:

- A **tipping / reward bot** that pays out UCT from its own float.
- A **faucet** that mints or sends test tokens on request.
- A **game NPC or agent** that holds a balance and pays/receives autonomously.
- Any **autonomous agent** that transacts on its own behalf.

**Use a different example if:**

- You need to act on a **user's** wallet (they approve each action) → [`../browser/`](../browser) (web) or [`../nodejs/`](../nodejs) (Node over WebSocket).
- You only need to **know who a user is** (login), not hold funds → [`../backend-auth/`](../backend-auth).

## Prerequisites

- Node.js **>= 22**.
- A reachable **wallet-api** instance in `WALLET_API_URL` (the `.env.example`
  ships the public testnet2 one). This is required — see
  [Custody: wallet-api is required](#custody-wallet-api-is-required).
- No aggregator account setup needed: leave `AGGREGATOR_API_KEY` unset and the
  bot provisions its own free testnet2 aggregator key on first boot (see
  "Aggregator key — two ways" below).

## Run it

```bash
cd bot
npm install
cp .env.example .env
npm start
```

On the **first run**, `BOT_MNEMONIC` is empty, so the bot generates a fresh
mnemonic and prints it once:

```
=== GENERATED A NEW BOT MNEMONIC ===
<12-word mnemonic>
SAVE THIS — set BOT_MNEMONIC to persist this identity across runs.
=====================================
```

Copy that mnemonic into `BOT_MNEMONIC` in `.env`. Without it, every restart
generates a brand-new identity (and a brand-new empty wallet) instead of
resuming the previous one. Keys and identity state are stored locally under
`BOT_DATA_DIR` (default `./.bot-data`, wallet files in `./.bot-data/wallet`);
**tokens are not** — they live in the wallet-api inventory for this identity.

Once it's running:

```
> help
Commands:
  send @to <human-amount> <symbolOrCoinId>  - Send L3 tokens (money-safe: no auto-resend on a possibly-committed outcome)
  balance                                   - Show current balance
  pending                                   - Show transfers still converging
  resume                                    - Replay open intents (the safe retry — never re-sends)
  help                                      - Show this help
  exit                                      - Shut down and exit

> balance
> send @sometag 1.5 UCT
```

`<symbolOrCoinId>` accepts a coin symbol (e.g. `UCT`) or a 64-hex coin ID.
Amounts are human-readable decimals (`"1.5"`) — the bot converts them to
exact integer base units itself, so there's no floating-point precision loss
even for high-decimal coins.

`npm test` runs the unit tests: the base-unit/coin-resolution helpers in
`src/coins.ts`, the possibly-committed classifier in `src/sendSafety.ts`, and the
SGW-provisioning challenge validator plus key-resolution fallback chain in
`src/sgwChallenge.ts` / `src/aggregatorKey.ts`. `npm run typecheck` runs `tsc --noEmit`.

## Aggregator key — two ways

The bot needs an aggregator (SGW) API key to submit transactions. There are
two ways to get one, controlled by `AGGREGATOR_API_KEY` in `.env`:

- **Auto (default) — leave `AGGREGATOR_API_KEY` empty.** On first boot the
  bot provisions its own free-plan key from the SGW via a
  challenge/sign/verify flow (`sphere.deriveAddress(0)` signs the challenge —
  pure local crypto, no key needed to do it), then persists it to
  `BOT_DATA_DIR/aggregator-key.json` and reuses it on every later boot
  (no re-provisioning). This is a **get-or-create keyed by the wallet's
  index-0 identity** — same wallet, same key, stable across restarts. The
  gateway URL is taken from the SDK's per-network config
  (`NETWORKS[network].aggregatorUrl`), so this works on mainnet too, not just
  testnet2. The point is to give **each bot its own rate limit** — sharing one
  static key across every instance of this example means they'd all share
  (and contend for) that one key's rate limit.
- **Explicit — set `AGGREGATOR_API_KEY`.** Forces that key and skips
  provisioning entirely (e.g. to use a shared team key or a paid plan). This
  always takes priority over a saved/provisioned key.

The bot logs which path it took on boot: `Aggregator key: env` / `saved` /
`provisioned`. The key value itself is never logged.

## Custody: wallet-api is required

Up to sphere-sdk 0.13 this bot had a choice of custody: keep tokens in its own
local file storage (`tokensDir`), or let a wallet-api server hold them. **0.14
removed the first option.** `TokenStorageProvider` and both platform
implementations are deleted, the `tokenStorage` / `tokensDir` options are gone,
and `Sphere.init` throws a typed `INVALID_CONFIG` if no `walletApi` config is
passed. There is now exactly one supported composition, and it is what
`src/sphere.ts` builds:

```ts
const base = createNodeProviders({
  network: 'testnet2',
  dataDir: `${botDataDir}/wallet`,   // keys + identity, still local
  oracle: { apiKey },
});

const providers = createWalletApiProviders(base, {
  baseUrl: process.env.WALLET_API_URL,  // token custody + mailbox
  network: 'testnet2',                  // must match the base network
  deviceId,                             // optional, stabilises the refresh token
});

const { sphere } = await Sphere.init({ ...providers, network: 'testnet2', /* … */ });
```

What is and isn't local now:

| | Where it lives |
|---|---|
| Mnemonic, keys, identity, nametag cache | local (`StorageProvider`, `BOT_DATA_DIR`) |
| Token inventory, history, payment requests, mailbox | **wallet-api** (`WALLET_API_URL`) |
| DMs, group chat, nametag bindings | Nostr (unchanged) |

`WALLET_API_URL` is no longer an optional receive rail — it is the money path.
The bot fails fast on boot with a clear message if it is unset.

> **Upgrading a bot that already holds local tokens?** Relocate the funds
> **before** you upgrade: on your current (≤0.13) version, switch the
> composition to wallet-api custody and send-to-self so the tokens enter server
> inventory. Upgrading a build that still holds local-only tokens strands them
> until you downgrade and relocate. This is the SDK's own warning — see
> `sphere-sdk/docs/MIGRATION-PAYMENTS-V2.md` §3.

Known endpoints for `WALLET_API_URL`:

```
prod    = https://wallet-api.unicity.network
staging = https://wallet-api.staging.unicity.network
```

## Money-safety on send

`send` is deliberately conservative about anything that isn't an unambiguous
success or failure:

- If the SDK reports the send as **delivery-pending**, that's a *success* —
  the source token is already spent and the recipient's copy will land
  later. The bot just logs `sent, delivery pending` and moves on.
- If the SDK reports a **possibly-committed** outcome
  (`isPossiblyCommittedSendOutcome(err)`), the bot logs `spend may already be
  committed — do NOT re-send` and stops there. It does **not** automatically
  resend.

That last point matters for any bot you build on this pattern too: retrying
a possibly-committed send doesn't "try again" — it spends a *different*
source token for the same intent, which can pay the recipient twice.

The safe recovery is `payments.resumeNow()` — the `resume` command — which
replays the **same** intent (same `transferId`) rather than issuing a new
spend, and `payments.pendingTransfers()` — the `pending` command — to see what
is still converging.

The classifier lives in [`src/sendSafety.ts`](src/sendSafety.ts). It wraps the
SDK's `isPossiblyCommittedSendOutcome` with a duck-typed fallback on the same
error codes, because the SDK predicate gates on `instanceof SphereError` — which
silently returns `false` if two copies of the SDK ever land in one dependency
tree. A false negative there is precisely the retry that double-pays, so the
helper errs toward "may be committed" on any uncertainty.

## Generating a bot like this

The `sphere-connect` Claude Code plugin can scaffold an own-wallet bot like
this one from a prompt.
