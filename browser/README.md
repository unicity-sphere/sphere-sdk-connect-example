# Sphere Connect — Browser dApp Example

A React (Vite + Tailwind) **dApp** that connects to a user's Sphere wallet over
the Connect protocol and exercises the full surface: every read query, every
intent, and live events. The wallet stays separate — this app never sees a
private key; it asks the wallet to act, and the user approves.

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

**Events** (real-time push): auto-pushed `wallet:locked` · `identity:changed`; subscribable `transfer:incoming` · `transfer:confirmed` · `transfer:failed` · and more.

## How the connection is made

The example auto-selects a transport by priority (see `src/lib/detection.ts`):

```typescript
import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';

// P1 iframe (dApp embedded in Sphere) → P2 extension → P3 popup window.
const { client, connection, disconnect } = await autoConnect({
  dapp: { name: 'My dApp', description: 'What it does', url: location.origin },
  network: SPHERE_NETWORKS.testnet2,   // the {id,name} object — Connect wants this, not a string
});
// connection.identity → { chainPubkey, directAddress?, nametag? }
const balance = await client.query('sphere_getBalance');
```

`autoConnect` also handles **silent reconnect** on page load — no popup if the
origin is already approved.

## Documentation

- [CONNECT.md](CONNECT.md) — full browser dApp integration guide
- [../../sphere-sdk/docs/CONNECT.md](../../sphere-sdk/docs/CONNECT.md) — protocol reference
