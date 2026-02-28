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

## Transport Selection

Choose the right transport based on the context your dApp runs in:

| Situation | Transport | Priority |
|-----------|-----------|----------|
| dApp embedded inside Sphere as an iframe | `PostMessageTransport.forClient()` | P1 (highest) |
| Sphere browser extension installed | `ExtensionTransport.forClient()` | P2 |
| No extension, standalone page | `PostMessageTransport.forClient({ target: popup })` | P3 |

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
await wallet.intent('send', { recipient: '@alice', amount: 100 });
```

### State shape

```typescript
{
  isConnected: boolean;
  isConnecting: boolean;     // true while user-triggered connect is in progress
  isAutoConnecting: boolean; // true during silent check on page load
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
const l1      = await wallet.query('sphere_l1GetBalance');

// Assets & tokens
const assets = await wallet.query('sphere_getAssets');
const tokens = await wallet.query('sphere_getTokens', { coinId: 'USDC' });

// History
const history   = await wallet.query('sphere_getHistory');
const l1History = await wallet.query('sphere_l1GetHistory', { limit: 20 });

// Resolve nametag / address
const info = await wallet.query('sphere_resolve', { identifier: '@alice' });
```

---

## Intents (require user confirmation in wallet)

```typescript
// Send tokens
await wallet.intent('send', {
  recipient: '@alice',       // nametag, DIRECT:// address, or L1 address
  amount: 100,
  coinId: 'USDC',            // optional, default: native
});

// Send to L1
await wallet.intent('l1_send', {
  recipient: '0x...',
  amount: 0.001,
});

// Send DM
await wallet.intent('dm', {
  recipient: '@alice',
  content: 'Hello!',
});

// Create payment request (QR code shown to sender)
await wallet.intent('payment_request', {
  amount: 50,
  coinId: 'USDC',
  description: 'Coffee',
});

// Show receive address
await wallet.intent('receive', { coinId: 'USDC' });

// Sign a message
const { signature } = await wallet.intent('sign_message', {
  message: 'I agree to the terms',
});
```

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

Available events: `transfer:incoming`, `transfer:confirmed`, `transfer:failed`, `balance:updated`, `identity:updated`, `session:expired`.

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

## Popup Mode (P3) — Session Resume

When no extension is installed, the dApp opens a Sphere popup window. The session ID is stored in `sessionStorage` so that page refreshes don't re-trigger the approval modal (the wallet auto-approves known session IDs):

```typescript
// After connect:
sessionStorage.setItem('sphere-session', result.sessionId);

// On next load:
const client = new ConnectClient({
  transport: popupTransport,
  dapp,
  resumeSessionId: sessionStorage.getItem('sphere-session') ?? undefined,
});
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

Make sure to set `VITE_WALLET_URL` in `.env.local` if testing against a local wallet instance.
