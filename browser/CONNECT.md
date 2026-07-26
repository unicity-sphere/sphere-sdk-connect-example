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
  isWalletLocked: boolean;   // wallet:locked received, or the handshake answered locked: true —
                             // THE SESSION IS STILL ALIVE
  walletChanged: boolean;    // the wallet that came back from a lock has a different pubkey
  unlockEpoch: number;       // bumps on each unlock that returned the SAME wallet
  walletProtocol: string | null; // Connect version the WALLET reported ('2.1' | '2.0' | null)
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

Available events: auto-pushed `wallet:locked`, `wallet:unlocked`, `wallet:disconnected` and `identity:changed`, plus subscribable `transfer:incoming`, `transfer:confirmed`, `transfer:failed`. The full set is larger — see EventLogPanel for the complete list.

The four events in `AUTO_PUSHED_EVENTS` — `wallet:locked`, `wallet:unlocked`, `wallet:disconnected`, `identity:changed` — are pushed by `ConnectHost` unconditionally. Never route them through `sphere_subscribe`: `Sphere.on()` accepts any string and would silently never emit, so the subscribe would succeed and deliver nothing forever. See [Wallet Lock Handling](#wallet-lock-handling-wallet_eventslocked) below.

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

**A lock is a state, not a disconnect.** When the user locks the wallet, `ConnectHost.setLocked()`
pushes `wallet:locked` and keeps the session, the granted permissions and the transport alive.
There is no reconnect and no re-approval, in **any** transport mode — popup included.

### What is served while locked, and what is refused

| While locked | Answer |
|---|---|
| `sphere_getIdentity` | **Served** from the wallet's frozen snapshot — the same bytes the handshake response already handed this origin. |
| `sphere_subscribe` | **Served** `{ subscribed: true }`; the key is recorded and armed on unlock. |
| `sphere_unsubscribe` | **Served** `{ unsubscribed: true }`. |
| `sphere_disconnect` | **Served** — a locked dApp can always leave. |
| everything else, and every intent | `WALLET_LOCKED (4009)` with `data: { reason: 'locked' }`, **in the same tick**. |
| balances, tokens, history, fiat | **Never served and never cached.** A dApp with a stale balance is a dApp about to collect an unpayable spend. |

The host never parks a request and never waits for a human: a locked request is answered
immediately, so your own timeout is never involved.

### The three events that carry the model

All auto-pushed — no `sphere_subscribe`:

| Event | Meaning | What the dApp must do |
|---|---|---|
| `wallet:locked` | Wallet locked. **Session alive.** | Show a locked state. Do **not** disconnect, do **not** clear the saved session id. |
| `wallet:unlocked` | Same session continues. Payload: `{ identity? }`. | Compare `identity.chainPubkey` with the one you connected as. If it matches, retry your reads. If it does not, you are looking at a **different wallet** — resume nothing. |
| `wallet:disconnected` | The session is **gone** (logout, wallet deleted, expiry-while-locked, a different seed behind the lock screen). | Clear everything and re-handshake. |

```typescript
import { WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';

client.on(WALLET_EVENTS.LOCKED, () => {
  // Nothing is torn down here — in ANY transport mode.
  setState((s) => ({ ...s, isWalletLocked: true }));
});

client.on(WALLET_EVENTS.UNLOCKED, (data) => {
  const next = (data as { identity?: PublicIdentity }).identity ?? null;
  // Unlock is NOT implicitly the same wallet: the lock screen's
  // "Forgot password -> restore from recovery phrase" installs a different seed, and the
  // origin approval that authorises this session carries no identity binding.
  if (!next || next.chainPubkey !== connectedIdentity.chainPubkey) {
    setState((s) => ({ ...s, isWalletLocked: false, walletChanged: true, identity: next }));
    return; // resume nothing against a wallet you never connected to
  }
  setState((s) => ({ ...s, isWalletLocked: false, unlockEpoch: s.unlockEpoch + 1 }));
  // Nothing to re-subscribe: the host replays every suspended subscription key BEFORE it
  // pushes this event. There is deliberately no client-side re-subscribe API.
});

client.on(WALLET_EVENTS.DISCONNECTED, () => {
  transport.destroy();
  sessionStorage.removeItem(SESSION_KEY);
  setState(DISCONNECTED);
});
```

### Resuming onto a wallet that is already locked

A resume handshake whose `sessionId` matches **succeeds** while the wallet is locked, and the
response carries `locked: true`. You are connected **and** locked, in one state — no refusal, no
reconnect loop, and no consent prompt (any handshake while locked is forced silent, so an origin
without an approval sees only the usual empty refusal and learns nothing about the lock):

```typescript
const result = await client.connect();           // resumeSessionId set
if (result.locked === true) showLockedBanner();   // client.walletLocked is true too
```

### Talking to an older wallet

The protocol version is `2.1` (`SPHERE_CONNECT_VERSION`). The compatibility gate compares MAJOR
only, so a `2.0` wallet connects fine — but `wallet:locked` means the **opposite** there: the old
(now removed) `notifyWalletLocked()` pushed it *and* revoked the session, and `wallet:unlocked`
never arrives. `ConnectClient.walletProtocol` carries the wallet's version, captured at handshake:

```typescript
import { WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';

const minor = Number(/^\d+\.(\d+)$/.exec(client.walletProtocol ?? '')?.[1] ?? NaN);
const gracefulLock = Number.isFinite(minor) && minor >= 1;

client.on(WALLET_EVENTS.LOCKED, () => {
  if (!gracefulLock) return teardown(); // 2.0 wallet: the session is already gone
  setState((s) => ({ ...s, isWalletLocked: true }));
});
```

Treat an unknown or unparseable version as legacy. Assuming the session survives when it does not
leaves the dApp stuck on a locked screen forever, waiting for an event the wallet cannot send.

### Handling a request that fails while locked

Discriminate on the numeric `.code` and, if you want detail, on `.data` — **never** on the message
text. `'Wallet is locked'` is a documented recommendation, not a wire contract:

```typescript
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';

try {
  await client.query('sphere_getBalance');
} catch (err) {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
  if (code === ERROR_CODES.WALLET_LOCKED) {
    // data is { reason: 'locked' }
    setLocked(true);            // stay connected; retry after wallet:unlocked
  } else if (code === ERROR_CODES.NOT_CONNECTED || code === ERROR_CODES.SESSION_EXPIRED) {
    teardown();                 // the session really is gone
  } else {
    surface(err);               // permission denied, user rejected, rate limited, …
  }
}
```

A handful of SDK failures carry no code at all — `Not connected`, `Query timeout: …`,
`Intent timeout: …`, `Connection timeout`, `Disconnected` — so keep a **narrow** message fallback
for exactly those. Do **not** match on `session` or `closed`: this example used to, and any typed
refusal whose text merely mentioned a session forced a full disconnect. See
`src/lib/connectErrors.ts`.

### Who raises the unlock UI, and when

The **wallet** does, from its own permanent chrome, **only after a human clicks**. A dApp request
can never raise the password field — not a query, not an intent, not a handshake. What a locked
request does raise is a passive badge ("N requests waiting — Unlock") via the host's notify-only
`onLockedRequest`. Expect a locked request to fail typed and silently; expect the user to unlock in
the wallet on their own initiative.

The reason is not politeness. A forged *consent* dialog gains an attacker nothing; a forged
*credential* dialog harvests the password that decrypts the seed. Letting a framed origin choose
the moment a genuine password prompt appears is exactly how a user is trained that an unsolicited
one is normal.

### Retrying after unlock

In this release the SDK does **not** queue or replay a request that failed with 4009 — the original
promise rejects and retrying is the dApp's decision. This example bumps an `unlockEpoch` counter on
each same-wallet unlock and lets **read** panels re-fetch on it
(`src/components/queries/BalancePanel.tsx`).

**Never auto-replay an intent.** It moves money, and firing it immediately after an unlock means it
executes with no fresh user gesture, at the exact moment the wallet came back.

### Host-side requirement

The wallet host must map each transition to exactly one verb:

```typescript
connectHost.setLocked();        // lock:        pushes wallet:locked,       session PRESERVED
connectHost.updateSphere(s);    // unlock:      pushes wallet:unlocked,     session PRESERVED
connectHost.revokeSession();    // logout:      pushes wallet:disconnected, session DESTROYED
connectHost.setUnavailable();   // Sphere gone for a non-lock reason: revokes; requests answer 4001
```

Call `setLocked()` **before** `sphere.destroy()`: the host drops its Sphere reference and freezes
its snapshot there, and destroying first leaves in-flight requests reading a dead instance.

`notifyWalletLocked()` has been **removed**, not deprecated. Its old meaning was *revoke* and its
new meaning would have been *lock* — the opposite — so an alias would have silently inverted every
call site. Pick a verb from the table above.

---

## Choosing a transport: how long does the session need to live?

The three transports are not interchangeable. Pick by session lifetime, not by convenience.

**Popup (P3) — for a SHORT, bounded flow.** Connect, get a signature or a JWT, done. Everything
about the popup is fragile for anything longer:

- closing it is a real **disconnect** — the wallet revokes the session on `beforeunload` and
  pushes `wallet:disconnected`. There is no "reopen and resume": a fresh window means a fresh
  host with no session.
- reloading it **re-locks** the wallet. The password is memory-only by design, so a reload
  leaves nothing to decrypt the mnemonic with.
- it cold-starts **locked** even when the user has Sphere unlocked in another tab. A separate
  window is a separate JS context with its own memory; only the lock signal crosses windows
  (via `BroadcastChannel`), never the password.
- it does not scale to several dApps. Each dApp opens its own wallet window, so two connected
  apps mean two windows and two password prompts.

**Iframe (P1) — for a LONG-LIVED session.** The dApp runs inside Sphere, so one wallet window
serves every framed app: one host per app, one unlock for all of them, and the wallet's own
chrome carries the passive "N requests blocked — Unlock" badge. This is where a
session-preserving lock actually pays off — the host outlives both the lock and a reload of the
framed page.

A locked wallet serves only `sphere_getIdentity` (from a frozen snapshot), `sphere_subscribe`,
`sphere_unsubscribe` and `sphere_disconnect`. Balances, assets, tokens, fiat balance and history
are never served and never cached — a stale balance is a dApp about to offer an unpayable spend.
So a dApp must **stop issuing reads while `isWalletLocked`** and resume on `unlockEpoch`, rather
than polling into refusals: every refusal increments the wallet's blocked-request badge.

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
import { ERROR_CODES } from '@unicitylabs/sphere-sdk/connect';

try {
  await wallet.connect();
} catch (err) {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
  if (code === ERROR_CODES.WALLET_LOCKED)              { /* an unapprovable resume while locked */ }
  else if (code === ERROR_CODES.INCOMPATIBLE_NETWORK)  { /* dApp targets another network */ }
  else if (code === ERROR_CODES.USER_REJECTED)         { /* user declined */ }
  else if (err instanceof Error && err.message.includes('Popup blocked')) { /* allow popups */ }
  else { /* transport failure */ }
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
