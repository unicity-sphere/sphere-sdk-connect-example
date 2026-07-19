# Sphere Connect — Node.js dApp Example

A Node **CLI dApp** that connects to a Sphere wallet over the Connect protocol
using `WebSocketTransport`, and drives the full surface from the terminal:
queries, intents, and DM chat. It is the same *role* as the `browser/` example
— a dApp that acts on **someone else's** wallet — but over a WebSocket instead
of the browser's postMessage/extension transports.

This is the only example that exercises `WebSocketTransport`, the third Connect
transport (the other two, `PostMessageTransport` and `ExtensionTransport`, are
browser-only).

## When to use this

Reach for this when your app is a **Node process — a CLI, a desktop tool, a
server** — that needs to drive a user's wallet over a WebSocket.

Concrete examples:

- A **CLI admin / ops tool** that reads a connected wallet's balances and
  occasionally sends or signs.
- A **desktop or server-side dApp** that speaks to a wallet exposing a WebSocket
  `ConnectHost`.

> **Honest caveat — read before you build on this.** This example connects to a
> **mock wallet server** (`src/mock-wallet-server.ts`), because today there is
> **no standard Sphere wallet that exposes a WebSocket `ConnectHost`** — the
> hosted Sphere wallet is a web app and speaks postMessage / popup / extension.
> So treat `nodejs/` primarily as a **reference for `WebSocketTransport` and the
> Connect message flow from Node**, not as a plug-and-play "connect to your real
> wallet from a terminal" path.

**Use a different example if:**

- Your dApp runs in a **browser** → [`../browser/`](../browser) (postMessage / extension / popup).
- Your Node process should act **from its own wallet, no approval** → [`../bot/`](../bot) (it *is* the wallet; direct SDK, no Connect).
- You only need to **authenticate a user** (login), not move tokens → [`../backend-auth/`](../backend-auth).

## Run it

Two terminals:

```bash
cd nodejs
npm install
npm run server     # Terminal 1: mock wallet  (ws://localhost:8765)
npm run client     # Terminal 2: CLI dApp — type "help"
```

The client connects, then gives you a command loop:

```
identity | balance | assets | fiat | tokens | history | resolve @tag   # queries
send @to <amount-base-units> <coinId-hex>                              # intents
pay  @to <amount-base-units> <coinId-hex> [msg]                        # payment request
mint <coinId-hex> <amount-base-units> | dm @to <msg> | receive | sign <msg>
conversations | messages <pubkey> | unread | read <id...>              # chat
```

> Amounts are **base units** (integer strings) and `coinId` is the lowercase
> 64-hex id — the same contract the wallet enforces. A `send` may resolve with
> `deliveryPending: true` and no `transferId`; that is a success, not a retry.

## How the connection is made

```typescript
import { ConnectClient, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import { WebSocketTransport } from '@unicitylabs/sphere-sdk/connect/nodejs';
import WebSocket from 'ws';

const transport = WebSocketTransport.createClient({
  url: 'ws://localhost:8765',
  createWebSocket: (url) => new WebSocket(url),
});
await transport.connect();

const client = new ConnectClient({
  transport,
  dapp: { name: 'CLI Example', description: '…', url: 'cli://local' },
  network: SPHERE_NETWORKS.testnet2,   // the {id,name} object — Connect wants this, not a string
});
const { identity } = await client.connect();
```

## Documentation

- [../../sphere-sdk/docs/CONNECT.md](../../sphere-sdk/docs/CONNECT.md) — protocol reference
