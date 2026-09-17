# Sphere Connect — Node.js dApp Example

A Node **CLI dApp** that connects to a Sphere wallet over the Connect protocol
using `WebSocketTransport`, and drives the full surface from the terminal:
queries, intents, and DM chat. It is the same *role* as the `browser/` example
— a dApp that acts on **someone else's** wallet — but over a WebSocket instead
of the browser's postMessage/extension transports.

This is the only example that exercises `WebSocketTransport`, the third Connect
transport. The other two are browser-only: `PostMessageTransport`, which is what
a real dApp uses, and `ExtensionTransport`, which is **not a live path** — the
SDK still exports it, but the Sphere Chrome extension wallet is discontinued and
no supported wallet answers on it.

> **Needs `@unicitylabs/sphere-sdk` ≥ 0.14.1 on both sides.** A 0.14.1 `ConnectHost`
> enforces an SDK version floor at the handshake and refuses older clients with
> `UNSUPPORTED_PROTOCOL_VERSION` (4007) — including the mock wallet server here.
> The refusal carries `data.requiredSdk` / `data.actualSdk`; `describeConnectFailure()`
> in `src/lockResume.ts` is a small example of turning that into useful copy.

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
mintnft [name]                                                         # NFT (Connect 2.3)
sendnft @to <tokenId>                                                  # expect -32601
conversations | messages <pubkey> | unread | read <id...>              # chat
```

> Amounts are **base units** (integer strings) and `coinId` is the lowercase
> 64-hex id — the same contract the wallet enforces. A `send` may resolve with
> `deliveryPending: true` and no `transferId`; that is a success, not a retry.

> `mintnft` builds an `NftContent` and puts it on the wire through `nftContentToWire()` —
> Connect messages are JSON, so inline media bytes become base64 and every metadata field must
> be present (`null` for the absent ones). `sendnft` is expected to be **refused with
> `-32601`**: `send_nft` is declared in Connect 2.2 and **no wallet implements it**, so the mock
> refuses it exactly as the real Sphere wallet does rather than faking a success.

> `SPHERE_NETWORK=mainnet|testnet2` (default `testnet2`) decides which network the client
> declares in its handshake. A mismatch with the wallet is refused with `INCOMPATIBLE_NETWORK`
> (4008), and so is declaring none at all.

### What the mock wallet teaches

`src/mockSphere.ts` is shaped like a **real wallet**: `payments` is the payments-v2 facade
(`assets()` / `tokens()` / paged `history()` / `requests`). There is no `paymentsV2` alias — the
SDK's `SphereInstance` declares `payments` alone. The host maps the Connect wire onto it —
`sphere_getBalance` and `sphere_getAssets` both serve `assets()`, `sphere_getHistory` walks every
`history()` page and flattens them — so the **dApp side of the wire did not change at all** in
0.14. That is the point: the payments rebuild is invisible to a Connect client.

`src/mockIntents.ts` holds the intent answers, in their own module so the tests can reach them
(importing `mock-wallet-server.ts` starts a WebSocket server as a side effect). They mirror the
real wallet where it succeeds *and* where it refuses. `mint_nft` runs the **two** checks a wallet
runs before it shows an approval screen: `nftContentFromWire()` for shape and base64, then
`encodeNftContent()` for the value rules — media types, link schemes, and a link's `sha256` being
the 64-hex digest of the linked file. The second one matters: `sha256: ''` passes the wire codec
and dies in `encodeNftContent`, so a mock that stopped at the codec would accept content the real
wallet must refuse. Either throw becomes an `INVALID_PARAMS` refusal naming the field, rather than
a payload signed blind. `send_nft` is answered `-32601`.

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

- [sphere-sdk `docs/CONNECT.md`](https://github.com/unicity-sphere/sphere-sdk/blob/main/docs/CONNECT.md) — protocol reference
