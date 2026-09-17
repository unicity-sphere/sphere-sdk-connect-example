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
cp .env.example .env    # VITE_WALLET_URL + VITE_SPHERE_NETWORK (mainnet | testnet2)
npm run dev             # http://localhost:5174
```

> `VITE_SPHERE_NETWORK` decides which chain this build declares in its handshake
> (default `testnet2`). It is not hard-coded for a reason: both networks are live, and
> a bundle that can only ever mean one chain is how a build ships pointed at the wrong
> one. A mismatch with the wallet is refused with `INCOMPATIBLE_NETWORK` (4008) before
> any UI appears — and so is declaring no network at all.

Requires a Sphere wallet reachable at `http://localhost:5173`. Open the dev URL,
click **Connect**, approve, and each panel drives one query / intent / event.

> The example also contains a browser-extension path (P2), and it is **dead**: the
> Sphere Chrome extension wallet is discontinued, so `hasExtension()` is false and the
> code never runs. It is kept as a `ExtensionTransport` reference only — do not plan a
> production integration around it.

### Testing against the hosted wallet

To connect a *local* dApp to the **live** wallet, load it as a **custom agent** inside
the wallet:

```
https://sphere.unicity.network/agents/custom?url=https://localhost:5174
```

The wallet embeds your dApp in an **iframe** and acts as the Connect host (the P1
transport). The **popup path (P3) does NOT work against the hosted wallet — it returns
`403`.** Popup/localhost only works for a Sphere wallet you run yourself at
`localhost:5173`.

> ⚠ **The `url` must be `https`.** The wallet frames a custom agent only when the URL's
> protocol is `https:` (`isHttpsUrl` in the wallet's `DesktopLayout`). It is a
> **protocol-only** check, so `https://localhost:5174` passes — but plain
> `http://localhost:5174` does not: the tab silently falls back to the wallet's own
> prompt instead of showing your dApp, with no error to tell you why.
>
> **This dev server is plain http.** `vite.config.ts` sets only `server: { port: 5174 }`
> — no `https`, no certificates. To get an https origin, either:
>
> - **enable https on Vite** — add `server.https` with a locally trusted certificate
>   (e.g. one from `mkcert`), or run `vite --https` with the same, then load
>   `https://localhost:5174`; or
> - **put a tunnel in front** — `cloudflared tunnel --url http://localhost:5174`,
>   `ngrok http 5174`, or any equivalent, and pass the public https URL.
>
> Whichever you pick, the browser must actually trust the certificate: a framed page
> behind an untrusted cert cannot show its interstitial, so it just fails to load.

## What it demonstrates

**Queries** (read-only, no approval):
`sphere_getIdentity` · `sphere_getBalance` · `sphere_getAssets` · `sphere_getFiatBalance` · `sphere_getTokens` · `sphere_getHistory` · `sphere_resolve`

**Intents** (open the wallet for approval):
`send` · `mint` · `mint_nft` · `dm` · `payment_request` · `receive` · `sign_message`

> `INTENT_ACTIONS` has **8** members. The eighth is `send_nft` (Connect 2.2, scope
> `nft:transfer`), which has **no panel here on purpose**: it is declared in the
> protocol and **the Sphere wallet answers it with `-32601`**, so a panel would demo
> a flow that cannot run. The Node example has a `sendnft` command that shows the
> refusal instead.
>
> The **Mint NFT** panel drives `mint_nft` (Connect 2.3, scope `nft:mint` — its own
> scope, because the wallet signs content this page supplies). It builds an
> `NftContent` and puts it on the wire through `nftContentToWire()`; Connect messages
> are JSON, so inline media bytes become base64 and every metadata field must be
> present (`null` for the absent ones).
>
> Its optional image is an `NftLink`, so it asks for the file's **SHA-256** and media type as
> well as the URI, and refuses to submit without them. The wire codec checks shape and base64
> only — `sha256: ''` passes it — while `encodeNftContent`, which a wallet runs before it signs,
> requires the 64-hex digest of the linked file and an `https://`, `ipfs://` or `ar://` URI. A
> demo that shipped an empty digest would build content the wallet must refuse. The panel can
> fetch the file and compute the digest for you when the host allows the cross-origin read.

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
