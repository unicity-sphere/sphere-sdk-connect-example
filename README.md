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

Not every example uses Connect: the **bot** runs its own wallet directly, and
the **backend** in backend-auth only verifies a signature. See the guide below.

## Which example do I need?

The examples differ along two axes: **whose wallet** your app uses, and **what
it needs to do** with it.

| Example | Your app is… | The wallet is… | Can move tokens? | Reach for it when… |
|---|---|---|---|---|
| **`browser/`** | a web page / dApp | the **user's**, elsewhere | ✅ with per-action approval | your dApp runs in a browser and the user is present to approve each send — e.g. a **browser game** where the player approves in-game purchases |
| **`nodejs/`** | a Node CLI / service | the **user's**, over WebSocket | ✅ with approval | you need a **CLI / desktop / server** dApp that drives a user's wallet over a WebSocket (see the caveat in its README) |
| **`bot/`** | an autonomous agent | **its own** (own keys) | ✅ no approval — it owns the funds | you're building a **tipping bot, faucet, game NPC that pays rewards, or an agent** that acts from its own float with no human in the loop |
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
Needs a Sphere wallet reachable at `http://localhost:5173` (or the Sphere extension). See [browser/README.md](browser/README.md).

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
cp .env.example .env
npm start          # boots its own wallet on testnet2, self-mints, DM-echoes
```
No Connect involved — the bot *is* the wallet. See [bot/README.md](bot/README.md).

### `backend-auth/` — sign in with a Sphere wallet

```bash
# Terminal 1 — backend  (http://localhost:8787)
cd backend-auth/backend  && npm install && cp .env.example .env && npm start
# Terminal 2 — frontend (http://localhost:5173)
cd backend-auth/frontend && npm install && cp .env.example .env && npm run dev
```
Frontend brokers a `sign_message`; backend recovers the pubkey and issues a JWT. See [backend-auth/README.md](backend-auth/README.md).

## Dependencies

All four packages pin the same published SDK version:

```json
"@unicitylabs/sphere-sdk": "0.11.14"
```

## Documentation

- [browser/CONNECT.md](browser/CONNECT.md) — full browser dApp integration guide
- [sphere-sdk/docs/CONNECT.md](../../sphere-sdk/docs/CONNECT.md) — protocol reference

## License

MIT
