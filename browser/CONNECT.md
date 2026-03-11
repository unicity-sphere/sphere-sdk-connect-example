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
| Previously approved origin (bridge iframe) | `PostMessageTransport.forClient({ target: iframe })` | P3 |
| First-time connection, no extension | Popup → bridge takeover | P4 |

### Detection utilities

```typescript
import { isInIframe, hasExtension } from './lib/detection';

if (isInIframe()) {
  // P1: inside Sphere iframe
} else if (hasExtension()) {
  // P2: extension installed
} else if (localStorage.getItem('sphere-connect-bridge-approved')) {
  // P3: bridge iframe (previously approved — auto-reconnect)
} else {
  // P4: open popup for first-time approval, then switch to bridge
}
```

---

## Auto-Connect on Page Load

On mount, the hook tries to restore a previous session without user interaction:

1. **Extension** (if installed): silent connect via `ExtensionTransport`
2. **Bridge iframe** (if previously approved): creates a hidden `<iframe>` pointing to `WALLET_URL/connect-bridge?origin=...`, connects silently via `PostMessageTransport`
3. **Popup session resume** (fallback): re-opens popup with saved `sessionId`

```typescript
// Extension silent check
const client = new ConnectClient({
  transport: ExtensionTransport.forClient(),
  dapp,
  silent: true,   // do NOT open any wallet UI — fail fast if not approved
});

try {
  const result = await client.connect();
  // Origin is approved — restore session silently
} catch {
  // Not approved — try bridge iframe next
}
```

**How `silent: true` works inside the wallet:**
- Wallet checks its approved origins storage
- If found → approves immediately (no popup)
- If not found → rejects immediately (no popup, no window)

This prevents stale approval state from causing unexpected popups after the user disconnects from the wallet side.

---

## Full Hook Example (`useWalletConnect.ts`)

The `src/hooks/useWalletConnect.ts` hook implements the full priority flow with bridge iframe support:

```typescript
const wallet = useWalletConnect();

// On mount: tries extension → bridge iframe → popup session resume
// wallet.isAutoConnecting === true while the check is in progress

if (wallet.isAutoConnecting) {
  return <LoadingScreen />;
}

if (!wallet.isConnected) {
  return <ConnectButton onClick={wallet.connect} />;
}

// Connected — queries work even after popup is closed (bridge mode)
const balance = await wallet.query('sphere_getBalance');
await wallet.intent('send', { recipient: '@alice', amount: 100 });

// When bridge needs popup for an intent:
if (wallet.needsPopup) {
  return <WalletApprovalPrompt onClick={wallet.openApprovalPopup} />;
}
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
  needsPopup: boolean;       // true when bridge needs popup for intent approval
  openApprovalPopup: () => void; // opens popup in bridge intent-only mode
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

Disconnect behavior varies by transport mode:

- **Extension (P2):** Sends `sphere_disconnect`, wallet removes origin from approved storage. Next load: silent-check fails → Connect button shown.
- **Bridge iframe (P3):** Iframe removed from DOM, `sphere-connect-bridge-approved` cleared from localStorage. Next load: no bridge attempt → Connect button shown.
- **Popup-only (P4):** Popup closed, `sessionStorage` cleared. Next load: Connect button shown.

---

## Bridge Iframe Mode (P3) — Persistent Session

When no extension is installed, the dApp uses a hidden bridge iframe for persistent sessions. This solves the problem of losing the session when the popup is closed.

### How it works

```
dApp page
├── Hidden <iframe src="sphere.../connect-bridge?origin=...">
│   ├── Sphere instance (same localStorage — same wallet)
│   ├── ConnectHost (persistent — handles queries + events)
│   └── PostMessageTransport → window.parent (dApp)
│
├── PostMessageTransport.forClient(iframe) — persistent connection
│
└── [on intent needing approval] → popup opens on demand
    ├── Receives intent via BroadcastChannel from bridge
    ├── Shows approval UI (send/sign/DM modal)
    ├── Posts result back via BroadcastChannel
    └── Can be closed — session stays alive in iframe
```

### First-time connection flow

1. User clicks Connect → popup opens for approval (bridge can't do this — user gesture would expire)
2. User approves in popup → origin saved in wallet's approved origins
3. After popup approval, dApp switches session to bridge iframe (bridge takeover)
4. Popup is closed automatically — session stays in iframe
5. `sphere-connect-bridge-approved` flag saved in dApp's `localStorage`

### Subsequent page loads

1. On mount, dApp sees `sphere-connect-bridge-approved` in `localStorage`
2. Creates hidden bridge iframe → iframe auto-approves (origin already known)
3. Session restored silently — no popup needed

### Intent approval in bridge mode

When the wallet needs user approval for an intent (send, sign, etc.):
1. Bridge iframe sends `sphere-connect:open-popup` message to dApp
2. dApp sets `needsPopup = true` → shows "Wallet approval needed" prompt
3. User clicks → popup opens at `/connect?origin=...&bridge` (intent-only mode)
4. Popup receives intent via `BroadcastChannel`, shows approval modal
5. User approves/rejects → result sent back to bridge via `BroadcastChannel`

---

## Popup-Only Mode (P4) — Session Resume

Fallback when bridge iframe is not available. The session ID is stored in `sessionStorage`:

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
