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

Requires a Sphere wallet reachable at `http://localhost:5173`. Open the dev URL,
click **Connect**, approve, and each panel drives one query / intent / event.

> The example also contains a browser-extension path (P2), and it is **dead**: the
> Sphere Chrome extension wallet is discontinued, so `hasExtension()` is false and the
> code never runs. It is kept as a `ExtensionTransport` reference only — do not plan a
> production integration around it.

### Testing against the hosted wallet

To connect a *local* dApp to the **live** wallet, put it behind a **public https origin** and
load that origin as a **custom agent**:

```bash
# Terminal 1 — the dev server (plain http, that is fine behind a tunnel)
npm run dev                                   # http://localhost:5174

# Terminal 2 — an https tunnel in front of it
cloudflared tunnel --url http://localhost:5174   # or: ngrok http 5174
```

```
https://sphere.unicity.network/agents/custom?url=https://<your-tunnel-host>
```

The wallet embeds your dApp in an **iframe** and acts as the Connect host (the P1 transport).

> ### ⚠ Two separate gates, and `localhost` fails the first one
>
> **1. The CDN rejects local URLs in the query string — before the wallet sees them.**
> Measured with `curl` on 2026-09-17 (HTTP status codes only, not a browser session):
>
> | Request | Status |
> |---|---|
> | `GET /connect` | **200** |
> | `GET /connect?origin=https%3A%2F%2Fexample.com` | **200** |
> | `GET /agents/custom?url=https%3A%2F%2Ffoo.ngrok.app` | **200** |
> | **any** route with `localhost` or `127.0.0.1` anywhere in the query | **403** |
>
> The 403 body is CloudFront's ("ERROR: The request could not be satisfied"), it reproduces on
> every route tested (`/connect?origin=…`, `/agents/custom?url=…`) with and without browser-like
> `User-Agent` / `Accept` headers, and it is **not** specific to `/connect`. So it is a CDN/WAF
> rule about local URLs in the query — **not** the hosted wallet refusing the popup route. Any
> `?url=https://localhost:5174` is answered by the CDN and never reaches the wallet.
>
> **2. The wallet frames a custom tab only when the URL is `https`.** `isHttpsUrl` in the
> wallet's `src/components/desktop/DesktopLayout.tsx` is a **protocol-only** check, so a
> plain-http tunnel URL would not be framed even if gate 1 let it through: the tab silently
> falls back to the wallet's own prompt, with no error to tell you why.
>
> A public https tunnel clears both. `mkcert` + `vite --https` gives you
> `https://localhost:5174`, which clears gate 2 but **not** gate 1, so it is no use in this
> query string.
>
> **Not tested end to end:** the wallet's in-app *Load Custom URL* prompt. Typing an https URL
> there carries no query string, so gate 1 does not apply and only the `isHttpsUrl` gate should
> — but nobody has run that path through, so treat it as untested rather than as a second
> supported route.
>
> **Popup and `localhost` stay fine against a wallet you run yourself** — the sphere dev server
> on `http://localhost:5173`. Nothing above applies there; it is the hosted deployment's CDN
> that has the rule.

## What it demonstrates

**Queries** (read-only, no approval):
`sphere_getIdentity` · `sphere_getBalance` · `sphere_getAssets` · `sphere_getFiatBalance` · `sphere_getTokens` · `sphere_getHistory` · `sphere_resolve`

**Intents** (open the wallet for approval):
`send` · `mint` · `dm` · `payment_request` · `receive` · `sign_message`

> `INTENT_ACTIONS` has **8** members **in sphere-sdk 0.17.2**: the six above plus `send_nft`
> (Connect 2.2, scope `nft:transfer`) and `mint_nft` (Connect 2.3, scope `nft:mint`), which this
> example does not demonstrate yet. **The Sphere wallet implements `mint_nft` and answers
> `send_nft` with `-32601`.** ⚠ **Both need a 0.17.x client** — this package still pins
> **0.14.2**, where `INTENT_ACTIONS` is the six above and `SPHERE_CONNECT_VERSION` is `2.1`.

> Amounts on `send` / `payment_request` are **base units** (an integer string —
> convert a human amount with `parseTokenAmount(human, decimals)`); `coinId` is
> the lowercase 64-hex id. A `send` can resolve as a success with
> `deliveryPending: true` and **no `transferId`** — see the Send panel; never
> re-send that (it would pay twice).

**Events** (real-time push): auto-pushed `wallet:locked` · `wallet:unlocked` · `wallet:disconnected` · `identity:changed`; subscribable `transfer:incoming` · `transfer:updated` · `transfer:attention` · `inventory:updated` · `payment_request:updated` · `connection:status` · and more. Those are the sphere-sdk 0.14 names. Fourteen pre-0.14 names (`transfer:confirmed`, `sync:completed`, …) still fire, re-emitted by the host's compatibility adapter — but every other one (every `invoice:*`, every `swap:*`, `sync:started`, …) was removed without an adapter and fails *silently*, since `Sphere.on()` accepts any string. See the compat table in [CONNECT.md](CONNECT.md#events). A lock does **not** disconnect — see [CONNECT.md](CONNECT.md#wallet-lock-handling-wallet_eventslocked).

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
// P2 never fires in practice: the Sphere extension wallet is discontinued.
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
> selection in a single call — pass `walletUrl` for the popup path and `network`,
> and read the identity from `result.connection.identity`. Note that an error it
> throws is **not** `instanceof` the `ConnectError` exported by
> `@unicitylabs/sphere-sdk/connect`, because `/connect/browser` ships its own copy
> of the Connect core (sphere-sdk#789) — duck-type on `.code`, as
> `src/lib/connectErrors.ts` does. See
> [`../backend-auth/frontend`](../backend-auth/frontend) for that style.

## Documentation

- [CONNECT.md](CONNECT.md) — full browser dApp integration guide
- [sphere-sdk `docs/CONNECT.md`](https://github.com/unicity-sphere/sphere-sdk/blob/main/docs/CONNECT.md) — protocol reference
