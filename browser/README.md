# Sphere Connect — Browser dApp Example

A React (Vite + Tailwind) **dApp** that connects to a user's Sphere wallet over
the Connect protocol and exercises the full surface: every read query, every
intent, and live events. The wallet stays separate — this app never sees a
private key; it asks the wallet to act, and the user approves.

> **Needs `@unicitylabs/sphere-sdk` ≥ 0.14.1.** Wallet hosts from 0.14.1 enforce
> an SDK version floor at the handshake and refuse older clients with
> `UNSUPPORTED_PROTOCOL_VERSION` (4007) before any approval UI shows. See
> [CONNECT.md](CONNECT.md#-your-dapp-needs-unicitylabssphere-sdk--0141).

## When to use this

Reach for this shape when **your app runs in a browser** and **the user is
present to approve actions** on their own wallet.

Concrete examples:

- A **browser game** where the player connects their wallet and approves each
  in-game purchase / send.
- A **web marketplace or tipping page** that asks the wallet to send tokens or
  create a payment request.
- Any web frontend that reads a user's balance / assets / history and
  occasionally asks them to sign or send.

**Use a different example if:**

- Your app is a **Node CLI / server**, not a web page → [`../nodejs/`](../nodejs) (drives a wallet over WebSocket).
- Your agent should act **from its own wallet, no user approval** → [`../bot/`](../bot).
- You only need to **know who the user is** (login), not move their tokens → [`../backend-auth/`](../backend-auth).

## Run it

```bash
cd browser
npm install
npm run dev        # http://localhost:5174
```

Requires a Sphere wallet reachable at `http://localhost:5173`, or the Sphere
browser extension installed. Open the dev URL, click **Connect**, approve, and
each panel drives one query / intent / event.

> **Testing against the real (hosted) wallet — use the iframe, not a popup.**
> To connect a *local* dApp to the **live** wallet, load it as a **custom
> agent** inside the wallet at **https://sphere.unicity.network/agents/custom** —
> the wallet embeds your dApp in an **iframe** and acts as the Connect host (the
> P1 transport). The **popup path (P3) does NOT work against the hosted wallet —
> it returns `403`.** Popup/localhost only works for a Sphere wallet you run
> yourself at `localhost:5173`.

## What it demonstrates

**Queries** (read-only, no approval):
`sphere_getIdentity` · `sphere_getBalance` · `sphere_getAssets` · `sphere_getFiatBalance` · `sphere_getTokens` · `sphere_getHistory` · `sphere_resolve`

**Intents** (open the wallet for approval):
`send` · `mint` · `dm` · `payment_request` · `receive` · `sign_message`

> Amounts on `send` / `payment_request` are **base units** (an integer string —
> convert a human amount with `parseTokenAmount(human, decimals)`); `coinId` is
> the lowercase 64-hex id. A `send` can resolve as a success with
> `deliveryPending: true` and **no `transferId`** — see the Send panel; never
> re-send that (it would pay twice).

**Events** (real-time push): auto-pushed `wallet:locked` · `wallet:unlocked` · `wallet:disconnected` · `identity:changed`; subscribable `transfer:incoming` · `transfer:updated` · `transfer:attention` · `inventory:updated` · `payment_request:updated` · `connection:status` · and more. Those are the sphere-sdk 0.14 names. Sixteen pre-0.14 names (`transfer:confirmed`, `sync:completed`, …) still fire, re-emitted by the host's compatibility adapter — but 26 others (every `invoice:*`, every `swap:*`, `sync:started`, …) were removed without one and fail *silently*, since `Sphere.on()` accepts any string. See the compat table in [CONNECT.md](CONNECT.md#events). A lock does **not** disconnect — see [CONNECT.md](CONNECT.md#wallet-lock-handling-wallet_eventslocked).

## How the connection is made

This example **hand-rolls** transport selection by priority (see
`src/hooks/useWalletConnect.ts` + `src/lib/detection.ts`) so you can see each
transport explicitly:

```typescript
import { ConnectClient, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import { PostMessageTransport, ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser';
import { isInIframe, hasExtension } from './lib/detection';

const WALLET_URL = import.meta.env.VITE_WALLET_URL ?? 'https://sphere.unicity.network';

// P1 iframe (dApp embedded in Sphere) → P2 extension → P3 popup window.
let transport;
if (isInIframe()) {
  transport = PostMessageTransport.forClient();
} else if (hasExtension()) {
  transport = ExtensionTransport.forClient();
} else {
  const popup = window.open(`${WALLET_URL}/connect?origin=${encodeURIComponent(location.origin)}`, 'sphere', 'width=420,height=700');
  transport = PostMessageTransport.forClient({ target: popup, targetOrigin: WALLET_URL });
}

const client = new ConnectClient({ transport, dapp, network: SPHERE_NETWORKS.testnet2 });
const { identity } = await client.connect();   // silent on load if the origin is already approved
```

> **Prefer the one-liner?** The SDK also ships `autoConnect()` (from
> `@unicitylabs/sphere-sdk/connect/browser`), which does this whole P1/P2/P3
> selection in a single call — pass `walletUrl` for the popup path, and read the
> identity from `result.connection.identity`. See
> [`../backend-auth/frontend`](../backend-auth/frontend) for that style.

## Documentation

- [CONNECT.md](CONNECT.md) — full browser dApp integration guide
- [../../sphere-sdk/docs/CONNECT.md](../../sphere-sdk/docs/CONNECT.md) — protocol reference
