# CLAUDE.md - Sphere SDK Connect Example

Demonstration project showing how to integrate the **Sphere Connect** protocol into browser and Node.js applications. The Connect module enables dApps to interact with Sphere wallets through a transport-agnostic, permission-based RPC interface.

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
│   │   │   ├── types.ts             # Local TS interfaces (Asset, Token, L1Balance, etc.)
│   │   │   └── format.ts           # Amount formatting (decimals, fiat, L1, truncate, relativeTime)
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
│   │       ├── queries/             # 8 query panels (read-only operations)
│   │       │   ├── IdentityPanel.tsx     # sphere_getIdentity
│   │       │   ├── AssetsPanel.tsx       # sphere_getAssets (table with icons, fiat, 24h)
│   │       │   ├── BalancePanel.tsx      # sphere_getBalance + sphere_getFiatBalance
│   │       │   ├── TokensPanel.tsx       # sphere_getTokens (with status badges)
│   │       │   ├── HistoryPanel.tsx      # sphere_getHistory (with type badges)
│   │       │   ├── L1BalancePanel.tsx    # sphere_l1GetBalance (vested/unvested breakdown)
│   │       │   ├── L1HistoryPanel.tsx    # sphere_l1GetHistory (with limit param)
│   │       │   └── ResolvePanel.tsx      # sphere_resolve (identifier input)
│   │       ├── intents/             # 7 intent panels (require wallet approval)
│   │       │   ├── SendPanel.tsx         # send (recipient, amount, coin selector, memo)
│   │       │   ├── L1SendPanel.tsx       # l1_send (shows L1 balance, recipient, amount)
│   │       │   ├── DMPanel.tsx           # dm (recipient, message)
│   │       │   ├── PaymentRequestPanel.tsx # payment_request (recipient, amount, coin, message)
│   │       │   ├── ReceivePanel.tsx      # receive (button only, no params)
│   │       │   ├── SignMessagePanel.tsx  # sign_message (message textarea)
│   │       │   └── BackendAuthPanel.tsx  # end-to-end: challenge → sign → verify → JWT → /me
│   │       └── events/
│   │           └── EventLogPanel.tsx # All 9 events, color-coded, filterable
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── nodejs/                    # Node.js CLI example
│   ├── src/
│   │   ├── index.ts               # Interactive CLI client (all queries + intents)
│   │   └── mock-wallet-server.ts  # Mock wallet with rich test data
│   ├── package.json
│   └── tsconfig.json
│
└── backend/                    # Node.js backend example
    ├── src/
    │   ├── index.ts            # Fastify bootstrap
    │   └── auth.ts             # /auth/challenge + /auth/verify + /me
    ├── package.json
    └── README.md
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

### Backend example

```bash
cd backend
npm install
npm run dev    # Fastify server on http://localhost:4000
```

Endpoints: `POST /auth/challenge`, `POST /auth/verify`, `GET /me` (Bearer JWT).
Pair with the `browser/` dApp (**Backend Auth** panel) and any Sphere wallet for a full end-to-end
auth demo using `verifySphereAuth` from `@unicitylabs/sphere-sdk`.

CLI commands:
- **Queries:** `identity`, `balance`, `assets`, `fiat`, `tokens`, `history`, `l1`, `l1history [limit]`, `resolve @tag`
- **Intents:** `send @to amt [coin]`, `l1send alpha1... amount`, `dm @to message`, `pay @to amt [coin] [message]`, `receive`, `sign message text`
- **Other:** `disconnect`, `help`

## Dependencies

Both subprojects use a **local** sphere-sdk link:
```json
"@unicitylabs/sphere-sdk": "file:../../sphere-sdk"
```

- **Browser:** React 19, Vite 7, Tailwind CSS 4
- **Node.js:** `ws` (WebSocket), `tsx` (TypeScript runner)

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
| `sphere_l1GetBalance` | L1 balance | `l1:read` |
| `sphere_l1GetHistory` | L1 tx history | `l1:read` |
| `sphere_resolve` | Resolve nametag/address | `resolve:peer` |
| `sphere_subscribe` | Subscribe to events | `events:subscribe` |
| `sphere_unsubscribe` | Unsubscribe | `events:subscribe` |

**Intents** (require user approval each time):
| Intent Action | Description | Required Permission |
|--------------|-------------|---------------------|
| `send` | L3 token transfer | `transfer:request` |
| `l1_send` | L1 transaction | `l1:transfer` |
| `dm` | Direct message | `dm:request` |
| `payment_request` | Payment request | `payment:request` |
| `receive` | Receive incoming tokens | `transfer:request` |
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
- Opens wallet at `WALLET_URL + '/#/connect?origin=...'`
- Waits for `HOST_READY_TYPE` message before establishing transport
- Popup close is treated as disconnection

**Iframe mode:**
- `PostMessageTransport.forClient()` targets `window.parent` automatically
- Host creates transport via `PostMessageTransport.forHost(iframe, { allowedOrigins })`

### Protocol Constants

```typescript
SPHERE_CONNECT_NAMESPACE = 'sphere-connect'
SPHERE_CONNECT_VERSION = '1.0'
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
| 4100 | `INSUFFICIENT_BALANCE` | Not enough tokens |
| 4101 | `INVALID_RECIPIENT` | Bad recipient address |
| 4102 | `TRANSFER_FAILED` | Transfer error |
| 4200 | `INTENT_CANCELLED` | Intent cancelled |

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
│  L1 Bal  │                                      │
│  L1 Hist │                                      │
│  Resolve │                                      │
│ INTENTS  │                                      │
│  Send    │                                      │
│  L1 Send │                                      │
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
- `formatL1(amount)` — formats L1 ALPHA amounts (8 decimal places)

### useWalletConnect Hook (`browser/src/hooks/useWalletConnect.ts`)

Central state management for wallet connection:
- Manages `ConnectClient` lifecycle (create → connect → disconnect → cleanup)
- Handles popup window open/close detection
- Implements `HOST_READY` handshake timeout
- Exposes: `client`, `identity`, `isConnected`, `isConnecting`, `error`, `connect()`, `disconnect()`
- Exposes: `query()`, `intent()`, `on()` — passed to panels as props

### Mock Wallet Server (`nodejs/src/mock-wallet-server.ts`)

Testing-only server that emulates wallet behavior:
- Creates `ConnectHost` with mock `SphereInstance`
- Auto-approves all connection requests with full permissions
- Auto-approves all intents with action-specific success responses
- Returns rich mock data: identity, assets (UCT + USDU with fiat/24h change), tokens (with statuses), history, L1 balance (with vested/unvested), L1 history

### Event Subscriptions

Subscribable events (via `client.on()`):
- `transfer:incoming` — Received tokens
- `transfer:confirmed` — Outgoing confirmed
- `transfer:failed` — Outgoing failed
- `identity:changed` — Address switch
- `nametag:registered` — Nametag registered
- `nametag:recovered` — Nametag recovered
- `address:activated` — New address tracked
- `sync:provider` — Sync result
- `payment_request:incoming` — Payment request received

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
cd browser && npm run dev      # Dev server (:5174)
cd browser && npm run build    # Type-check + Vite build
cd browser && npm run preview  # Preview production build

# Node.js
cd nodejs && npm run server    # Mock wallet (ws://localhost:8765)
cd nodejs && npm run client    # CLI client
```

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- React functional components with hooks
- Tailwind CSS for styling (browser)
- Async/await for all async operations
