# Sphere Connect — Own-Wallet Bot Example

A Node bot that runs its **own** Sphere wallet: its own keys, its own local
token storage, direct SDK usage. It boots a real `Sphere` instance against
**testnet2** the same way a wallet app would — there is no Connect protocol
involved anywhere in this example.

This is the opposite shape from the `browser/` and `nodejs/` examples in this
repo, which are **dApps** that connect *to* someone else's already-running
wallet over Connect (`ConnectClient` + a transport). This bot doesn't connect
to a wallet — **it *is* the wallet.**

What it does once running:
- Replies to any incoming Nostr DM with `echo: <message>`.
- Self-mints 100 `UCT` on boot as a starting balance (best-effort — logs a
  message instead of failing if minting isn't available).
- Exposes a small `send` / `balance` / `help` / `exit` command loop on stdin.
- Optionally logs incoming token transfers (see "Receiving tokens" below).

## Prerequisites

- Node.js **>= 22**.
- No account setup needed to send/DM: `bot/.env.example` already ships a
  **public, non-secret** testnet2 aggregator key (`AGGREGATOR_API_KEY`).

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
resuming the previous one. Wallet + token data are stored locally under
`BOT_DATA_DIR` (default `./.bot-data`, split into `./.bot-data/wallet` and
`./.bot-data/tokens`).

Once it's running:

```
> help
Commands:
  send @to <human-amount> <symbolOrCoinId>  - Send L3 tokens (money-safe: no auto-resend on a possibly-committed outcome)
  balance                                   - Show current balance
  help                                      - Show this help
  exit                                      - Shut down and exit

> balance
> send @sometag 1.5 UCT
```

`<symbolOrCoinId>` accepts a coin symbol (e.g. `UCT`) or a 64-hex coin ID.
Amounts are human-readable decimals (`"1.5"`) — the bot converts them to
exact integer base units itself, so there's no floating-point precision loss
even for high-decimal coins.

`npm test` runs the unit tests (currently just the base-unit/coin-resolution
helpers in `src/coins.ts`).

## Receiving tokens: the wallet-api nuance

DMs and **sending** work out of the box against testnet2 — no extra config
needed. **Receiving** tokens sent from the hosted Sphere wallet (e.g.
`sphere.unicity.network`, or a locally-run `sphere` dev server) is different.

The hosted Sphere wallet delivers sent tokens through the **wallet-api
mailbox**, not over Nostr. If `WALLET_API_URL` is left unset, this bot never
composes that mailbox rail, so it has no way to see those deliveries — a
transfer sent to it from the hosted wallet will simply never show up, no
error, nothing to catch. The bot logs this plainly on boot:

```
WALLET_API_URL not set — this bot will not receive tokens from the hosted wallet (see README).
```

To fix that, set `WALLET_API_URL` in `.env` to a wallet-api endpoint, e.g.
the public testnet2 instance:

```
WALLET_API_URL=https://wallet-api.unicity.network
```

With it set, the bot composes an *own-storage* wallet-api rail — it keeps
using its own local token storage and keys, it just also picks up mailbox
deliveries — and logs each incoming transfer, replying with a DM thank-you.

## Money-safety on send

`send` is deliberately conservative about anything that isn't an unambiguous
success or failure:

- If the SDK reports the send as **delivery-pending**, that's a *success* —
  the source token is already spent and the recipient's copy will land
  later. The bot just logs `sent, delivery pending` and moves on.
- If the SDK reports a **possibly-committed** outcome (the spend may or may
  not have gone through), the bot logs `spend may already be committed — do
  NOT retry` and stops there. It does **not** automatically resend.

That last point matters for any bot you build on this pattern too: retrying
a possibly-committed send doesn't "try again" — it spends a *different*
source token for the same intent, which can pay the recipient twice. Treat a
possibly-committed outcome as something a human (or a higher-level
reconciliation step) needs to look at, never as "just retry."

## Generating a bot like this

The `sphere-connect` Claude Code plugin can scaffold an own-wallet bot like
this one from a prompt.
