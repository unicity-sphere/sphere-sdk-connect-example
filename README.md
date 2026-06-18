# Sphere Connect Example

Demonstration project showing how to integrate the **Sphere Connect** protocol into browser and Node.js applications.

## What is Sphere Connect?

Sphere Connect is a typed RPC protocol that allows web dApps to communicate with a Sphere wallet — reading balances, sending tokens, signing messages — without exposing private keys.

```
dApp (ConnectClient)  ←→  Transport  ←→  Wallet (ConnectHost)
```

## Project Structure

```
sphere-sdk-connect-example/
├── browser/     # React dApp example (Vite + Tailwind)
└── nodejs/      # Node.js CLI client + mock wallet server
```

## Quick Start

### Browser dApp

```bash
cd browser
npm install
npm run dev        # http://localhost:5174
```

Requires a Sphere wallet at `http://localhost:5173` (or Sphere extension installed).

### Node.js CLI

```bash
cd nodejs
npm install
npm run server     # Terminal 1: mock wallet (ws://localhost:8765)
npm run client     # Terminal 2: CLI client
```

## Browser Example Features

All 7 queries, 6 intents, and 9 events are demonstrated:

**Queries** (read-only):
`sphere_getIdentity` · `sphere_getBalance` · `sphere_getAssets` · `sphere_getFiatBalance` · `sphere_getTokens` · `sphere_getHistory` · `sphere_resolve`

**Intents** (require wallet approval):
`send` · `mint` · `dm` · `payment_request` · `receive` · `sign_message`

**Events** (real-time push):
`transfer:incoming` · `transfer:confirmed` · `transfer:failed` · `balance:updated` · `identity:updated` · `session:expired` · and more

## 3-Priority Transport Selection

```typescript
import { isInIframe, hasExtension } from './lib/detection';

if (isInIframe()) {
  // P1: dApp embedded inside Sphere as iframe
  transport = PostMessageTransport.forClient();
} else if (hasExtension()) {
  // P2: Sphere browser extension installed
  transport = ExtensionTransport.forClient();
} else {
  // P3: open Sphere as popup window
  transport = PostMessageTransport.forClient({ target: popup, targetOrigin: WALLET_URL });
}
```

## Auto-Connect on Page Load

```typescript
// Silent check — no popup if not approved
const client = new ConnectClient({ transport, dapp, silent: true });
try {
  await client.connect();   // instant if already approved
} catch {
  // Show Connect button
}
```

## Dependencies

Both subprojects use a local sphere-sdk reference:
```json
"@unicitylabs/sphere-sdk": "file:../../sphere-sdk"
```

Rebuild SDK before testing: `cd ../../sphere-sdk && npm run build`

## Documentation

- [browser/CONNECT.md](browser/CONNECT.md) — full dApp integration guide
- [sphere-sdk/docs/CONNECT.md](../../sphere-sdk/docs/CONNECT.md) — protocol reference

## License

MIT
