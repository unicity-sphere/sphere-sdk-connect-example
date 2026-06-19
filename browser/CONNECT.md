# Sphere Connect — dApp Integration Guide

This guide explains how to integrate a browser dApp with the Sphere wallet using the Sphere Connect protocol.

## Quick Start

```typescript
import { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
import { ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser';

const client = new ConnectClient({
  transport: ExtensionTransport.forClient(),
  dapp: {
    name: 'My App',
    description: 'Sphere-connected dApp',
    url: location.origin,
  },
});

const { identity, permissions } = await client.connect();
console.log('Connected as:', identity.nametag ?? identity.chainPubkey);
```

---

## Connection Modes

The dApp tries connection methods in priority order:

| Priority | Mode | Transport | Persistent? | When |
|----------|------|-----------|-------------|------|
| P1 | Embedded iframe | `PostMessageTransport.forClient()` | Yes | dApp runs inside Sphere's own iframe |
| P2 | Browser extension | `ExtensionTransport.forClient()` | Yes | Sphere extension is installed |
| P3 | Popup window | `PostMessageTransport.forClient({ target: popup })` | **No** — popup must stay open | Fallback |

**P2 (extension)** is the best mode for production — the connection survives page navigations and requires no open windows after initial approval.

**P3 (popup)** requires the Sphere popup to remain open. Closing it terminates the connection. Session IDs are saved to `sessionStorage` so page reloads can resume without re-approval.

> **Why not a hidden bridge iframe?**
> Cross-origin iframes cannot access the wallet's IndexedDB in modern Chrome (third-party storage partitioning since v115). `BroadcastChannel` is also partitioned. `requestStorageAccess()` requires a user gesture inside the iframe, which is impossible for a hidden element. For persistent connections without the extension, deploy wallet and dApp on the same origin or keep the popup open.

### Detection utilities

```typescript
import { isInIframe, hasExtension } from './lib/detection';

if (isInIframe()) {
  // P1: inside Sphere iframe
} else if (hasExtension()) {
  // P2: extension installed
} else {
  // P3: open popup
}
```

---

## Auto-Connect on Page Load

When using the extension, check silently on every page load whether the origin is already approved. If yes — connect immediately. If no — show the Connect button.

```typescript
const client = new ConnectClient({
  transport: ExtensionTransport.forClient(),
  dapp,
  silent: true,   // do NOT open any wallet UI — fail fast if not approved
});

try {
  const result = await client.connect();
  // Origin is approved — restore session silently
} catch {
  // Not approved — show Connect button, wait for user action
}
```

**How it works inside the wallet:**
- `silent=true` → wallet checks its approved origins storage
- If found → approves immediately (no popup)
- If not found → rejects immediately (no popup, no window)

This prevents stale approval state from causing unexpected popups after the user disconnects from the wallet side.

---

## Full Hook Example (`useWalletConnect.ts`)

The `src/hooks/useWalletConnect.ts` hook implements the full 3-priority flow:

```typescript
const wallet = useWalletConnect();

// On mount: silent-checks if extension already approved this origin
// wallet.isAutoConnecting === true while the check is in progress

if (wallet.isAutoConnecting) {
  return <LoadingScreen />;
}

if (!wallet.isConnected) {
  return <ConnectButton onClick={wallet.connect} />;
}

// Connected
const balance = await wallet.query('sphere_getBalance');
// amount is in BASE UNITS (smallest unit) — e.g. 1 of an 18-decimals coin = '1000000000000000000'
await wallet.intent('send', { to: '@alice', amount: '1000000000000000000', coinId: '<lowercase 64-hex coin id>' });
```

### State shape

```typescript
{
  isConnected: boolean;
  isConnecting: boolean;     // true while user-triggered connect is in progress
  isAutoConnecting: boolean; // true during silent check on page load
  isWalletLocked: boolean;   // true when wallet sends LOCKED event (extension/iframe only)
  identity: PublicIdentity | null;
  permissions: PermissionScope[];
  error: string | null;
}
```

---

## Queries (read-only, no user interaction)

```typescript
// Identity
const identity = await wallet.query('sphere_getIdentity');

// Balances
const balance = await wallet.query('sphere_getBalance');
const fiat    = await wallet.query('sphere_getFiatBalance');

// Assets & tokens
const assets = await wallet.query('sphere_getAssets');
const tokens = await wallet.query('sphere_getTokens', { coinId: '<lowercase 64-hex coin id>' });

// History
const history = await wallet.query('sphere_getHistory');

// Resolve nametag / address
const info = await wallet.query('sphere_resolve', { identifier: '@alice' });
```

---

## Intents (require user confirmation in wallet)

```typescript
// Send tokens. amount is in BASE UNITS (smallest indivisible unit), as a string —
// the same convention as `mint` and the SDK. Convert at the dApp edge, e.g.
// the SDK's parseTokenAmount('1.5', decimals) (or ethers/viem parseUnits).
await wallet.intent('send', {
  to: '@alice',                              // nametag or DIRECT:// address
  amount: '1500000000000000000',             // base units (= 1.5 of an 18-decimals coin)
  coinId: '<lowercase 64-hex coin id>',      // required, lowercase 64-hex
});

// Self-mint a fungible token (amount in base units)
await wallet.intent('mint', { coinId: '<lowercase-hex>', amount: '1000000' });

// Send DM
await wallet.intent('dm', {
  to: '@alice',
  message: 'Hello!',
});

// Create payment request (amount in base units, like `send`)
await wallet.intent('payment_request', {
  to: '@bob',
  amount: '5000000000000000000',             // base units
  coinId: '<lowercase 64-hex coin id>',
  message: 'Coffee',
});

// Show receive address
await wallet.intent('receive', {});

// Sign a message
const { signature } = await wallet.intent('sign_message', {
  message: 'I agree to the terms',
});
```

> **Note:** Invoice / accounting intents are experimental and are **not** supported by the Sphere wallet. Do not use them.

---

## Events (real-time wallet push)

```typescript
// Subscribe to incoming transfers
const unsub = wallet.on('transfer:incoming', (data) => {
  console.log('Incoming:', data);
  refetchBalance();
});

// Always clean up
return () => unsub();
```

Available events: auto-pushed `wallet:locked` and `identity:changed`, plus subscribable `transfer:incoming`, `transfer:confirmed`, `transfer:failed`. The full set is larger — see EventLogPanel for the complete list.

### Auto-pushed wallet events

`WALLET_EVENTS.LOCKED` (`wallet:locked`) and `WALLET_EVENTS.IDENTITY_CHANGED` (`identity:changed`) are pushed automatically by `ConnectHost` — no `sphere_subscribe` call is needed. See [Wallet Lock Handling](#wallet-lock-handling-wallet_eventslocked) below for details.

---

## Disconnect

```typescript
await wallet.disconnect();
```

When using the extension (P2):
- `disconnect()` sends `sphere_disconnect` to the wallet
- The wallet removes this origin from its approved origins storage
- Next page load: silent-check will fail → Connect button is shown
- User must click Connect again and approve (or re-approve)

When using the popup (P3):
- The popup window is closed
- The session ID in `sessionStorage` is cleared
- Next load: a new popup is opened and the approval flow starts again

---

## Wallet Lock Handling (`WALLET_EVENTS.LOCKED`)

When the wallet user logs out or locks the wallet, the `ConnectHost` pushes a `wallet:locked` event to all connected dApps. This is an auto-pushed event — no `sphere_subscribe` call is needed.

The correct response depends on the connection mode:

### Extension / iframe mode (P1, P2)

Set `isWalletLocked = true` and show a "wallet locked" overlay. The transport stays alive — the extension or parent frame is still running. When the user unlocks or imports a new wallet, the host pushes `identity:changed`, which clears the locked state and updates the displayed identity.

```typescript
import { WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';

const unsubLocked = client.on(WALLET_EVENTS.LOCKED, () => {
  setState((s) => ({ ...s, isWalletLocked: true }));
});

const unsubIdentity = client.on(WALLET_EVENTS.IDENTITY_CHANGED, (data) => {
  // Clears locked state and updates identity when wallet is unlocked
  setState((s) => ({ ...s, isWalletLocked: false, identity: data as PublicIdentity }));
});
```

### Popup mode (P3)

Fully disconnect: destroy the transport, clear the client reference, and remove the saved session from `sessionStorage`. **Do NOT close the popup window** — the user may import another wallet in the same popup and reconnect from scratch.

```typescript
const unsubLocked = client.on(WALLET_EVENTS.LOCKED, () => {
  if (popupMode.current) {
    // Popup navigated away (logout/refresh) — transport is dead, fully disconnect
    transportRef.current?.destroy();
    clientRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    setState(DISCONNECTED);
    // Note: do NOT close the popup — user can import another wallet there
  } else {
    // Extension/iframe — show locked state, wait for unlock
    setState((s) => ({ ...s, isWalletLocked: true }));
  }
});
```

> **Why the difference?** In popup mode, the wallet page navigated away from `/connect` (e.g. to the logout screen), so the `PostMessageTransport` is dead — there is nothing to resume. In extension/iframe mode, the background script or parent frame stays alive and will push `identity:changed` once the wallet is unlocked.

### Host-side requirement

Wallet hosts (the Sphere web app `ConnectPage`, the extension background) **must** call `connectHost.notifyWalletLocked()` when the user logs out. This sends the `wallet:locked` event to the dApp and revokes the session. Call it **before** `destroy()` so the dApp receives a clean signal instead of getting `NOT_CONNECTED` errors on its next request.

```typescript
// In the wallet's ConnectPage — when user logs out:
connectHost.notifyWalletLocked();  // sends LOCKED event + revokes session
connectHost.destroy();             // cleans up transport
```

---

## Popup Mode (P3) — Session Resume

When no extension is installed, the dApp opens a Sphere popup window. **The popup must stay open** for the connection to work — closing it destroys the transport and disconnects.

### How session resume works

1. **Save after connect:** After a successful popup connection, save `result.sessionId` to `sessionStorage`.
2. **Check on mount:** On page load, check for a saved session. If found, pass `resumeSessionId` to `ConnectClient` so the wallet auto-approves without showing the consent modal again.
3. **Include in auto-connect logic:** The saved session must be included in the `willSilentCheck` flag so the `isAutoConnecting` state starts as `true` — preventing a flash of the Connect button while session resume is attempted.
4. **Clear on disconnect/failure/lock:** Always remove the saved session when the connection ends (user disconnect, popup closed, error, or wallet locked).

```typescript
const SESSION_KEY = 'sphere-connect-popup-session';

// Include saved session in silent-check flag (prevents Connect button flash)
const willSilentCheck = isInIframe() || hasExtension() || !!sessionStorage.getItem(SESSION_KEY);

// After successful connect — save session
const result = await client.connect();
sessionStorage.setItem(SESSION_KEY, result.sessionId);

// On next page load — resume session
const savedSession = sessionStorage.getItem(SESSION_KEY);
if (savedSession) {
  const client = new ConnectClient({
    transport: popupTransport,
    dapp,
    resumeSessionId: savedSession,
    silent: true,  // fail fast if session expired
  });
  try {
    const result = await client.connect();
    sessionStorage.setItem(SESSION_KEY, result.sessionId);
  } catch {
    // Session expired or popup closed — clear and show Connect button
    sessionStorage.removeItem(SESSION_KEY);
  }
}

// On disconnect, error, or wallet locked — always clear
sessionStorage.removeItem(SESSION_KEY);
```

---

## Environment Variables

```bash
VITE_WALLET_URL=https://sphere.unicity.network  # wallet URL for P3 popup mode
```

---

## Error Handling

```typescript
try {
  await wallet.connect();
} catch (err) {
  if (err.message.includes('Popup blocked')) {
    // User needs to allow popups
  } else if (err.message.includes('Connection timeout')) {
    // Wallet did not respond in time
  } else {
    // User rejected or other error
  }
}
```

---

## Running the Example

```bash
cd sphere-sdk-connect-example/browser
npm install
npm run dev       # starts on http://localhost:5174
```

The Sphere wallet, when run locally, listens on `http://localhost:5173`.

### Environment Variables

Set `VITE_WALLET_URL` in `.env.development` or `.env.local` to point to your wallet instance:

```bash
VITE_WALLET_URL=https://sphere.unicity.network   # production (default)
VITE_WALLET_URL=http://localhost:5173             # local development (Sphere wallet)
```

The example dev server runs on port **5174** (see `vite.config.ts`); the Sphere wallet runs on port **5173**. The Vite config only sets `server: { port: 5174 }` — it does not enable HTTPS or load any certificates, so the dev server is served over plain `http`.
