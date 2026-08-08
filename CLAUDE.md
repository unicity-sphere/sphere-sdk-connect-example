# CLAUDE.md - Sphere SDK Connect Example

> **SDK floor:** every package pins `@unicitylabs/sphere-sdk` **0.14.2** exactly. Wallet hosts
> from 0.14.1 enforce an SDK version floor at the Connect handshake (`ConnectHost`'s built-in
> default is `0.14.1-0`, overridable via `ConnectHostConfig.minSdkVersion`): a client on an older
> SDK is refused with `UNSUPPORTED_PROTOCOL_VERSION` (4007) carrying `data.requiredSdk` /
> `data.actualSdk`. `ConnectClient` has reported its version since **0.10.1**, so `actualSdk` is
> the reported string (`"0.13.1"`) — `null` / `"unknown (not reported)"` only reaches a host from
> 0.9.x or 0.10.0. The Connect protocol is unchanged at **2.1**.

Demonstration project with four runnable examples of working with a Sphere wallet: a **browser dApp** and a **Node.js dApp** (both use the Connect protocol to drive a user's wallet), a **bot** that runs its own wallet (direct SDK, no Connect), and a **backend-auth** flow (a frontend brokers a wallet signature, a backend verifies it and issues a JWT). The Connect module enables dApps to interact with Sphere wallets through a transport-agnostic, permission-based RPC interface.

## Project Structure

```
sphere-sdk-connect-example/
├── browser/                    # React dApp example (Vite + Tailwind)
│   ├── src/
│   │   ├── App.tsx            # Sidebar navigation + section routing
│   │   ├── main.tsx           # React entry point
│   │   ├── hooks/
│   │   │   └── useWalletConnect.ts   # Core hook: popup/iframe connect logic
│   │   ├── lib/
│   │   │   ├── types.ts             # Local TS interfaces (Asset, Token, etc.)
│   │   │   └── format.ts           # Amount formatting (decimals, fiat, truncate, relativeTime)
│   │   └── components/
│   │       ├── ConnectButton.tsx     # "Connect Wallet" button with loading state
│   │       ├── layout/
│   │       │   ├── PageShell.tsx     # Sidebar + header + content area layout
│   │       │   └── WalletHeader.tsx  # Compact header: nametag, address, disconnect
│   │       ├── ui/
│   │       │   ├── ResultDisplay.tsx # JSON result viewer with copy + raw toggle
│   │       │   ├── CoinBadge.tsx    # Token icon (img or colored letter) + symbol
│   │       │   ├── CoinSelect.tsx   # Dropdown token selector (fetches assets from wallet)
│   │       │   └── StatusBadge.tsx  # Colored status badges (confirmed/pending/failed)
│   │       ├── queries/             # 6 query panels (read-only operations)
│   │       │   ├── IdentityPanel.tsx     # sphere_getIdentity
│   │       │   ├── AssetsPanel.tsx       # sphere_getAssets (table with icons, fiat, 24h)
│   │       │   ├── BalancePanel.tsx      # sphere_getBalance + sphere_getFiatBalance
│   │       │   ├── TokensPanel.tsx       # sphere_getTokens (with status badges)
│   │       │   ├── HistoryPanel.tsx      # sphere_getHistory (with type badges)
│   │       │   └── ResolvePanel.tsx      # sphere_resolve (identifier input)
│   │       ├── intents/             # 6 intent panels (require wallet approval)
│   │       │   ├── SendPanel.tsx         # send (recipient, amount, coin selector, memo)
│   │       │   ├── MintPanel.tsx         # mint (coinId, amount)
│   │       │   ├── DMPanel.tsx           # dm (recipient, message)
│   │       │   ├── PaymentRequestPanel.tsx # payment_request (recipient, amount, coin, message)
│   │       │   ├── ReceivePanel.tsx      # receive (button only, no params)
│   │       │   └── SignMessagePanel.tsx  # sign_message (message textarea)
│   │       └── events/
│   │           └── EventLogPanel.tsx # Color-coded, filterable event log
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── nodejs/                    # Node.js dApp — CLI over WebSocketTransport + a mock wallet
│   ├── src/
│   │   ├── index.ts               # Interactive CLI client (all queries + intents)
│   │   └── mock-wallet-server.ts  # Mock wallet with rich test data
│   ├── package.json
│   └── tsconfig.json
│
├── bot/                       # Bot that runs its OWN wallet (direct SDK, NOT Connect)
│   ├── src/
│   │   ├── sphere.ts              # own-wallet Sphere.init (createNodeProviders + createWalletApiProviders)
│   │   ├── index.ts               # DM auto-reply, self-mint, money-safe send loop
│   │   ├── coins.ts               # symbol→coinId + human↔base-unit helpers (unit-tested)
│   │   ├── sendSafety.ts          # mayBeCommitted(): never re-send a possibly-committed spend (unit-tested)
│   │   ├── aggregatorKey.ts       # env key → saved → SGW auto-provision + persist (unit-tested)
│   │   ├── provisionAggregatorKey.ts, sgwChallenge.ts  # SGW challenge/sign/verify
│   │   └── *.test.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── backend-auth/              # Sign in with a Sphere wallet (quest topology)
    ├── backend/               # Express: /challenge + /verify via recoverPubkeyFromSignature → JWT
    └── frontend/              # Vite dApp: autoConnect → sign_message → POST /verify → session
```

## Quick Start

### Browser dApp

```bash
cd browser
npm install
npm run dev        # Vite dev server on http://localhost:5174
```

Requires a wallet app running at `http://localhost:5173` (the Sphere wallet).

### Node.js CLI

```bash
cd nodejs
npm install

# Terminal 1: Start mock wallet server
npm run server     # WebSocket server on ws://localhost:8765

# Terminal 2: Run CLI client
npm run client     # Connects to ws://localhost:8765
```

CLI commands:
- **Queries:** `identity`, `balance`, `assets`, `fiat`, `tokens`, `history`, `resolve @tag`
- **Intents:** `send @to <amount-base-units> <coinId-hex>`, `mint <coinId-hex> <amount-base-units>`, `dm @to message`, `pay @to <amount-base-units> <coinId-hex> [message]`, `receive`, `sign message text`
- **Other:** `disconnect`, `help`

> Amounts are **base units** (integer strings) and `coinId` is the lowercase 64-hex id — the contract the real wallet enforces.

### Bot (own wallet)

```bash
cd bot
npm install
cp .env.example .env
npm start          # boots its own wallet on testnet2, self-mints, DM-echoes
```

No Connect — the bot *is* the wallet. Leave `AGGREGATOR_API_KEY` empty and it auto-provisions its own free-plan SGW key on first boot and persists it. `WALLET_API_URL` is **required**: sphere-sdk 0.14 deleted own-storage custody (`tokenStorage` / `tokensDir` and both `TokenStorageProvider` implementations are gone), so `Sphere.init` throws `INVALID_CONFIG` without a `walletApi` composition. Keys/identity stay local under `BOT_DATA_DIR`; tokens, history and payment requests live in wallet-api.

### Backend Auth (sign in with a wallet)

```bash
# Terminal 1 — backend  (http://localhost:8787)
cd backend-auth/backend  && npm install && cp .env.example .env && npm start
# Terminal 2 — frontend (http://localhost:5173)
cd backend-auth/frontend && npm install && cp .env.example .env && npm run dev
```

Frontend brokers a `sign_message`; backend recovers the pubkey via `recoverPubkeyFromSignature` and issues a JWT keyed on `chainPubkey`. To test against the **real hosted wallet**, load a dApp via the iframe custom-agent at `https://sphere.unicity.network/agents/custom` — the popup path returns `403`.

## Dependencies

All five packages pin the same published SDK version, exactly (no caret):
```json
"@unicitylabs/sphere-sdk": "0.14.2"
```

- **Browser / backend-auth frontend:** React 19, Vite 7
- **Node.js / bot / backend-auth backend:** `tsx` (TypeScript runner); nodejs/bot use `ws`; backend-auth backend uses `express` + `jsonwebtoken`

## Sphere Connect Protocol Overview

### Architecture

```
┌──────────┐                          ┌──────────────┐
│   dApp   │   ConnectClient          │    Wallet     │   ConnectHost
│          │◄─────────────────────────►│   (Sphere)   │
│          │   Transport layer:       │              │
│          │   - PostMessage (browser) │              │
│          │   - WebSocket (Node.js)  │              │
└──────────┘                          └──────────────┘
```

### Key Imports

```typescript
// Core protocol
import { ConnectClient, ConnectHost, RPC_METHODS, INTENT_ACTIONS, PERMISSION_SCOPES }
  from '@unicitylabs/sphere-sdk/connect';

// Browser transport (iframe/popup communication)
import { PostMessageTransport }
  from '@unicitylabs/sphere-sdk/connect/browser';

// Node.js transport (WebSocket)
import { WebSocketTransport }
  from '@unicitylabs/sphere-sdk/connect/nodejs';

// Types
import type { PublicIdentity, DAppMetadata, PermissionScope, ConnectResult }
  from '@unicitylabs/sphere-sdk/connect';
```

### TypeScript Path Aliases (Browser)

The browser `tsconfig.json` requires explicit path mappings for connect submodule imports:
```json
{
  "paths": {
    "@unicitylabs/sphere-sdk/connect": ["./node_modules/@unicitylabs/sphere-sdk/dist/connect/index.d.ts"],
    "@unicitylabs/sphere-sdk/connect/browser": ["./node_modules/@unicitylabs/sphere-sdk/dist/impl/browser/connect/index.d.ts"]
  }
}
```

### Operations

**Queries** (read-only, no user approval needed after initial connect):
| RPC Method | Description | Required Permission |
|-----------|-------------|---------------------|
| `sphere_getIdentity` | Wallet identity | `identity:read` |
| `sphere_getBalance` | Token balances | `balance:read` |
| `sphere_getAssets` | Asset summaries | `balance:read` |
| `sphere_getFiatBalance` | USD value | `balance:read` |
| `sphere_getTokens` | Token list | `tokens:read` |
| `sphere_getHistory` | Transaction history | `history:read` |
| `sphere_resolve` | Resolve nametag/address | `resolve:peer` |
| `sphere_subscribe` | Subscribe to events | `events:subscribe` |
| `sphere_unsubscribe` | Unsubscribe | `events:subscribe` |

`RPC_METHODS` has **14** members (the 9 above plus `sphere_disconnect` and the four DM reads:
`sphere_getConversations`, `sphere_getMessages`, `sphere_getDMUnreadCount`, `sphere_markAsRead`).
`PERMISSION_SCOPES` has **13**. The invoice surface (`sphere_getInvoices`,
`sphere_getInvoiceStatus`, the nine invoice intents, `invoice:read` / `invoice:write`) was
**deleted in sphere-sdk 0.14** — it never shipped enabled in any wallet host.

**Intents** (require user approval each time):
| Intent Action | Description | Required Permission |
|--------------|-------------|---------------------|
| `send` | L3 token transfer | `transfer:request` |
| `mint` | Self-mint a fungible token | `mint:request` |
| `dm` | Direct message | `dm:request` |
| `payment_request` | Payment request | `payment:request` |
| `receive` | Receive incoming tokens | `identity:read` |
| `sign_message` | Message signing | `sign:request` |

### Connection Flow

1. **dApp** opens wallet popup/iframe or WebSocket connection
2. **Wallet** signals readiness (`HOST_READY_TYPE` message for browser popup)
3. **dApp** creates `ConnectClient` with transport and calls `client.connect()`
4. **Wallet** (`ConnectHost`) calls `onConnectionRequest` callback → shows approval UI
5. User approves → session created with granted permissions
6. **dApp** uses `client.query()` for reads, `client.intent()` for actions
7. **Wallet** broadcasts events to subscribed dApps

### Browser Connection Modes

**Popup mode** (default in this example):
- Opens wallet at `WALLET_URL + '/connect?origin=...'`
- Waits for `HOST_READY_TYPE` message before establishing transport
- Popup close is treated as disconnection

**Iframe mode:**
- `PostMessageTransport.forClient()` targets `window.parent` automatically
- Host creates transport via `PostMessageTransport.forHost(iframe, { allowedOrigins })`

### Protocol Constants

```typescript
SPHERE_CONNECT_NAMESPACE = 'sphere-connect'
SPHERE_CONNECT_VERSION = '2.1'
HOST_READY_TYPE = 'sphere-connect:host-ready'
HOST_READY_TIMEOUT = 30_000  // ms
```

### Error Codes

| Code | Name | Description |
|------|------|-------------|
| 4001 | `NOT_CONNECTED` | No active session |
| 4002 | `PERMISSION_DENIED` | Missing permission scope |
| 4003 | `USER_REJECTED` | User denied intent |
| 4004 | `SESSION_EXPIRED` | Session TTL exceeded |
| 4005 | `ORIGIN_BLOCKED` | Origin not allowed |
| 4006 | `RATE_LIMITED` | Too many requests |
| 4007 | `UNSUPPORTED_PROTOCOL_VERSION` | Connect protocol MAJOR mismatch **or** the client's npm SDK version is below the host's floor (`data.requiredSdk` / `data.actualSdk`) |
| 4008 | `INCOMPATIBLE_NETWORK` | dApp targets a different network than the wallet |
| 4009 | `WALLET_LOCKED` | Wallet locked; the session is still alive |
| 4100 | `INSUFFICIENT_BALANCE` | Not enough tokens |
| 4101 | `INVALID_RECIPIENT` | Bad recipient address |
| 4102 | `TRANSFER_FAILED` | Transfer error |
| 4200 | `INTENT_CANCELLED` | Intent cancelled |
| 4201 | `INTENT_OUTCOME_UNKNOWN` | The wallet took the intent and the answer was lost — **never retry**, reconcile |

## Key Implementation Details

### Browser UI Layout

Sidebar + content area design:
```
┌─────────────────────────────────────────────────┐
│  Sphere Connect Example    │  @alice │ Disconnect│
├──────────┬──────────────────────────────────────┤
│ QUERIES  │                                      │
│  Identity│  (Active panel content)              │
│  Assets  │                                      │
│  Balance │                                      │
│  Tokens  │                                      │
│  History │                                      │
│  Resolve │                                      │
│ INTENTS  │                                      │
│  Send    │                                      │
│  Mint    │                                      │
│  DM      │                                      │
│  Pay Req │                                      │
│  Receive │                                      │
│  Sign    │                                      │
│ EVENTS   │                                      │
│  Log     │                                      │
└──────────┴──────────────────────────────────────┘
```
On mobile: sidebar collapses to a horizontal scrollable nav bar.

### Token Display

Token metadata (symbol, name, decimals, iconUrl) comes from the wallet's TokenRegistry via Connect responses — the dApp does **not** need its own registry. Components use:
- `CoinBadge` — renders token icon (img from `iconUrl` or colored letter fallback) + symbol
- `CoinSelect` — dropdown that fetches assets from wallet via `GET_ASSETS` query, shows icon + symbol + balance per coin
- `formatAmount(raw, decimals)` — converts raw amounts using token's decimal places

### useWalletConnect Hook (`browser/src/hooks/useWalletConnect.ts`)

- Manages `ConnectClient` lifecycle (create → connect → disconnect → cleanup) through one `handshake()` helper
- Handles popup window open/close detection and a permanent `HOST_READY` re-handshake
- Exposes state: `isConnected`, `isConnecting`, `isAutoConnecting`, `isWalletLocked`, `walletChanged`, `unlockEpoch`, `walletProtocol`, `identity`, `permissions`, `error`
- Exposes: `connect()`, `connectViaExtension()`, `connectViaPopup()`, `disconnect()`, `query()`, `intent()`, `on()`
- **A lock never disconnects** against a Connect ≥ 2.1 wallet: `wallet:locked` only sets `isWalletLocked`; a resume that lands on a locked wallet succeeds with `ConnectResult.locked === true`; `wallet:unlocked` compares the identity in the payload before resuming and re-subscribes to nothing (the host re-arms); `wallet:disconnected` is the only event that tears anything down. A 2.0 wallet (`walletProtocol`) still gets the old teardown — there, `wallet:locked` also revoked the session
- Failures are classified by `.code` and `data.reason` (`src/lib/connectErrors.ts`), never by a message regex

### Mock Wallet Server (`nodejs/src/mock-wallet-server.ts`)

- Creates `ConnectHost` with a mock `SphereInstance` (`src/mockSphere.ts`, shared with the tests). The mock is shaped like a real 0.14 wallet: `payments` is the payments-v2 facade (`assets()` / `tokens()` / paged `history()`) and `paymentsV2` is the deprecated alias `ConnectHost` reads to detect a v2 wallet
- Auto-approves all connection requests with full permissions
- Auto-approves all intents with action-specific success responses
- Returns rich mock data: identity, assets (UCT + USDU with fiat/24h change), tokens (with statuses), history
- stdin commands: `lock` (`setLocked()`), `unlock` (`updateSphere()`), `logout` (`revokeSession()`), `unavailable` (`setUnavailable()`), `status` (`walletState` + session + waiting count)
- `onLockedRequest` is notify-only and increments the passive "N requests waiting — Unlock" counter a real wallet renders in its permanent chrome. It **never** raises a credential surface — no dApp request may

### Event Subscriptions

- `wallet:locked` — wallet locked, **session alive**, requests answer 4009
- `wallet:unlocked` — same session resumed; payload carries the current identity; subscriptions already re-armed
- `wallet:disconnected` — session destroyed; re-handshake to continue
- `identity:changed` — address switch

Subscribable events (via `client.on()`), using the **sphere-sdk 0.14 names**:
- `transfer:incoming` — Received tokens (unchanged across the flip)
- `transfer:updated` — A transfer advanced; read `status` / `deliveryPending` (replaces `transfer:confirmed`, `transfer:delivery_pending`, `transfer:failed`)
- `transfer:attention` — `{ transferId, code, detail? }` (replaces `split:checkpoint-stuck`, `delivery:undeliverable`, `delivery:deferred`)
- `inventory:updated` — Token inventory changed (replaces the `sync:*` family)
- `history:updated` — A history entry was recorded
- `payment_request:incoming` — Payment request received
- `payment_request:updated` — `{ id, status }` (replaces `payment_request:paid` / `:rejected` / `:expired`)
- `connection:status` — `{ status: 'connected' | 'degraded' | 'offline' }` (replaces `realtime:status` + `storage:degraded`)
- `identity:changed` — Address switch
- `nametag:registered` / `nametag:recovered` — Nametag lifecycle
- `address:activated` — New address tracked

The **16** pre-0.14 names listed in the host's `COMPAT_ATTACHERS` (`connect/host/payments-compat.ts`)
still fire — the host re-emits each from the new event through a compatibility adapter. The other
**26** removed names do NOT, and they fail silently: `Sphere.on()` accepts any string, so the
subscribe succeeds and then never delivers. Whole families went that way — every `invoice:*` and
every `swap:*`, plus `sync:started` / `:error` / `:provider`, `inventory:conflict`,
`send:partial-remainder`, `transfer:invalid`, `walletapi:session`, `payment_request:accepted` /
`:response` / `:settling`. Auditing a pre-0.14 dApp means checking its subscriptions against the
adapter list, not assuming they carried over. New code uses the names above;
`browser/src/components/events/EventLogPanel.tsx` holds the canonical list this repo subscribes to.

## Connect Module Source (in sphere-sdk)

```
sphere-sdk/connect/
├── index.ts              # Barrel exports
├── protocol.ts           # Message types, RPC methods, intents, error codes
├── permissions.ts        # Permission scopes, validation, method→scope mapping
├── types.ts              # ConnectTransport, ConnectSession, configs
├── client/
│   └── ConnectClient.ts  # dApp-side client
└── host/
    └── ConnectHost.ts    # Wallet-side host

sphere-sdk/impl/browser/connect/
└── PostMessageTransport.ts   # Browser postMessage transport

sphere-sdk/impl/nodejs/connect/
└── WebSocketTransport.ts     # WebSocket server/client transport
```

## Common Commands

```bash
# Browser
cd browser && npm run dev        # Dev server (:5174)
cd browser && npm run build      # Type-check + Vite build
cd browser && npm test           # vitest run (jsdom + React Testing Library)
cd browser && npx vitest run src/hooks/useWalletConnect.test.ts   # one file

# Node.js
cd nodejs && npm run server      # Mock wallet (ws://localhost:8765) — type "lock" / "unlock"
cd nodejs && npm run client      # CLI client
cd nodejs && npm test            # vitest run — headless 4009 lock-gate test

# Backend auth / bot
cd backend-auth/frontend && npm test
cd backend-auth/backend  && npm test
cd bot && npm test
```

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- React functional components with hooks
- Tailwind CSS for styling (browser)
- Async/await for all async operations
