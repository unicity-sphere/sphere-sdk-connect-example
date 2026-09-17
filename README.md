# Sphere Connect Example

Four runnable examples showing the different ways an app can work with a Sphere
wallet — as a browser dApp, as a Node dApp, as a bot that runs its **own**
wallet, or as a backend that just authenticates a user.

## What is Sphere Connect?

Sphere Connect is a typed RPC protocol that lets a dApp talk to a user's Sphere
wallet — reading balances, sending tokens, signing messages — **without ever
seeing the private keys**. The dApp runs a `ConnectClient`; the wallet runs a
`ConnectHost`; a transport carries messages between them.

```
dApp (ConnectClient)  ←→  Transport  ←→  Wallet (ConnectHost)
```

> **All five packages require `@unicitylabs/sphere-sdk` ≥ 0.14.1.** Wallet hosts
> from 0.14.1 onward enforce an **SDK version floor at the handshake**: a client
> built on an older SDK is refused with `UNSUPPORTED_PROTOCOL_VERSION` (4007)
> before any approval UI appears, so a dApp that is not bumped simply stops
> connecting. The Connect protocol **MAJOR** is unchanged (still **2**), which is
> all the gate compares — this is a dependency bump and a rebuild, nothing more.
> (`SPHERE_CONNECT_VERSION` is **2.3** at the 0.17.2 pinned below.) See
> [browser/CONNECT.md](browser/CONNECT.md#-your-dapp-needs-unicitylabssphere-sdk--0141).

Not every example uses Connect: the **bot** runs its own wallet directly, and
the **backend** in backend-auth only verifies a signature. See the guide below.

## Which example do I need?

The examples differ along two axes: **whose wallet** your app uses, and **what
it needs to do** with it.

| Example | Your app is… | The wallet is… | Can move tokens? | Reach for it when… |
|---|---|---|---|---|
| **`browser/`** | a web page / dApp | the **user's**, elsewhere | ✅ with per-action approval | your dApp runs in a browser and the user is present to approve each send — e.g. a **browser game** where the player approves in-game purchases |
| **`nodejs/`** | a Node CLI / service | the **user's**, over WebSocket | ✅ with approval | you need a **CLI / desktop / server** dApp that drives a user's wallet over a WebSocket (see the caveat in its README) |
| **`bot/`** | an autonomous agent | **its own** (own keys, wallet-api custody) | ✅ no approval — it owns the funds | you're building a **tipping bot, faucet, game NPC that pays rewards, or an agent** that acts from its own float with no human in the loop |
| **`backend-auth/`** | a frontend + backend | the **user's** (frontend only signs) | ❌ **auth only** | you need to know **who** the player is — login, leaderboards, ownership, sessions — but do **not** need to move their tokens. **Recommended for games/apps that need authenticated identity, not custody or intents** |

Rules of thumb:

- **Need to move a *user's* tokens?** → `browser/` (web) or `nodejs/` (Node over WS). The user approves each action.
- **Moving *your own* tokens autonomously?** → `bot/`. It is the wallet; no approval prompts.
- **Just need to know who the user is?** → `backend-auth/`. It authenticates and stops there — it never touches funds.

## Quick Start

### `browser/` — web dApp over Connect

```bash
cd browser
npm install
npm run dev        # http://localhost:5174
```
Needs a Sphere wallet reachable at `http://localhost:5173`. See [browser/README.md](browser/README.md).

> **Testing a local dApp against the real (hosted) wallet?** Serve the dApp over **https on a
> publicly reachable host** — an https tunnel (`cloudflared tunnel --url http://localhost:5174`,
> `ngrok http 5174`) is the quick way — and load that URL as a custom agent at
> **`https://sphere.unicity.network/agents/custom?url=<your-public-https-url>`**. (Applies to
> both `browser/` and `backend-auth/frontend`.)
>
> ⚠ **A `localhost` / `127.0.0.1` URL in that query string never reaches the wallet.** Measured
> with `curl` on 2026-09-17: `/agents/custom?url=https%3A%2F%2Ffoo.ngrok.app` answers **200**, and
> so do `/connect` and `/connect?origin=https%3A%2F%2Fexample.com` — but **any** query string
> containing `localhost` or `127.0.0.1` answers **403** from CloudFront, on every route tested,
> with or without browser-like headers. It is a CDN/WAF rule about local URLs in the query, not
> the wallet refusing the popup route.
>
> ⚠ **Independently, the `url` must be `https`.** The wallet frames a custom tab only when the
> URL's protocol is `https:`, so a plain-http URL would not be framed even if it got through.
>
> Popup **and** `localhost` stay fine against a Sphere wallet **you run yourself** on
> `localhost:5173`. See [browser/README.md](browser/README.md#testing-against-the-hosted-wallet).

### `nodejs/` — Node dApp over WebSocket

```bash
cd nodejs
npm install
npm run server     # Terminal 1: mock wallet  (ws://localhost:8765)
npm run client     # Terminal 2: CLI dApp
```
Drives a wallet over `WebSocketTransport`. See [nodejs/README.md](nodejs/README.md).

### `bot/` — a bot with its own wallet

```bash
cd bot
npm install
cp .env.example .env    # WALLET_API_URL is REQUIRED — token custody lives there
npm start               # boots its own wallet on testnet2, self-mints, DM-echoes
```
No Connect involved — the bot *is* the wallet. Since sphere-sdk 0.14 there is no
own-storage custody: `Sphere.init` throws `INVALID_CONFIG` without a `walletApi`
composition, so `WALLET_API_URL` must be set. See [bot/README.md](bot/README.md).

### `backend-auth/` — sign in with a Sphere wallet

```bash
# Terminal 1 — backend  (http://localhost:8787)
cd backend-auth/backend  && npm install && cp .env.example .env && npm start
# Terminal 2 — frontend (http://localhost:5173)
cd backend-auth/frontend && npm install && cp .env.example .env && npm run dev
```
Frontend brokers a `sign_message`; backend recovers the pubkey and issues a JWT. See [backend-auth/README.md](backend-auth/README.md).

## Dependencies

All five packages pin the same published SDK version, exactly (no caret — these
are examples, and pin clarity matters more than float):

```json
"@unicitylabs/sphere-sdk": "0.17.2"
```

## Documentation

- [browser/CONNECT.md](browser/CONNECT.md) — full browser dApp integration guide
- [sphere-sdk `docs/CONNECT.md`](https://github.com/unicity-sphere/sphere-sdk/blob/main/docs/CONNECT.md) — protocol reference

## License

MIT
