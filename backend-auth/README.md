# Sphere Connect — Backend Auth Example

A two-part example showing how a **backend** authenticates a user by their
Sphere wallet's signature — not by trusting anything the client claims. A
`frontend/` dApp brokers a signature from the wallet; a `backend/` Express
server independently recovers the signer's public key from that signature
and issues a session JWT.

## Topology

```
Wallet                Frontend                 Backend
  |                       |                        |
  |                       |── GET /challenge ─────►|  ?chainPubkey=<hint>
  |                       |◄── { nonce, challenge }|  builds + stores challenge
  |                       |                        |
  |◄── intent: sign_message (challenge) ───|        |
  |── { signature, publicKey } ───────────►|        |
  |                       |                        |
  |                       |── POST /verify ───────►|  { nonce, signature }
  |                       |                        |  recoverPubkeyFromSignature
  |                       |◄── { jwt, chainPubkey }|  keyed on recovered pubkey
```

The **wallet never talks to the backend** — it only ever sees the frontend,
over the Connect protocol (`autoConnect` + the `sign_message` intent). The
frontend never proves anything by itself; it's a courier between the wallet
and the backend. The backend is the only party that decides who signed in,
and it decides that by cryptographically **recovering** the pubkey from the
signature — never by reading an identifier out of a request body.

## Run it

Two terminals:

```bash
# Terminal 1 — backend (http://localhost:8787)
cd backend-auth/backend
npm install
cp .env.example .env
npm start
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd backend-auth/frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`, click **Sign in with your Sphere wallet**,
approve the connection and the signature request in your wallet. On success
the page shows the recovered `chainPubkey` and a truncated session JWT.

## The byte-exact-challenge gotcha

`backend/src/challenge.ts` funnels both challenge creation (`GET /challenge`)
and challenge reconstruction (`POST /verify`) through one `formatChallenge`
function. This isn't stylistic — it's the whole safety property the flow
relies on.

`recoverPubkeyFromSignature(message, signature)` mathematically recovers
*some* valid public key from any well-formed signature — for the *exact*
message that was signed. If the backend reconstructs even a slightly
different string on `/verify` than the one the wallet actually signed on
`/challenge` (different whitespace, a different line ending, fields
reordered, a re-serialized timestamp), recovery doesn't fail — it silently
returns a **different, still valid-looking pubkey**. There is no exception,
no mismatch error: the backend just authenticates the wrong identity.

That's why:
- The backend stores the exact fields it used to build the challenge
  (`chainPubkey`, `domain`, `nonce`, `issuedAt`, `expiresAt`) and
  reconstructs the string from those stored fields on `/verify`, rather than
  re-deriving it from anything supplied by the request.
- There is exactly one formatter (`formatChallenge` in `challenge.ts`) — no
  second code path is allowed to assemble challenge text.
- The frontend signs the `challenge` string returned by `/challenge`
  **verbatim** — no trimming, re-encoding, or reformatting before it's
  handed to the `sign_message` intent.

## Don't trust the wallet's self-reported `publicKey`

The `sign_message` intent's result includes a `publicKey` field alongside
the `signature` — but that field is simply what the wallet *says* signed the
message. The frontend ignores it entirely. The backend never receives it (it
only gets `{ nonce, signature }` on `/verify`) and instead calls
`recoverPubkeyFromSignature` itself. Identity in this example is proven by
that recovery step alone; a value merely asserted by a client (a `publicKey`
field, a `chainPubkey` in a body, anything self-reported) is not a trust
input anywhere in this flow.

## chainPubkey vs. directAddress — a production note

This example keys identity purely on the **recovered `chainPubkey`**, and
stays deliberately thin because of it: recovering a pubkey from a signature
needs nothing but the `recoverPubkeyFromSignature` crypto helper — no
`Sphere` instance, no storage, no network.

A production deployment such as `sphere-api` goes one step further: it
additionally resolves the recovered `chainPubkey` to a `directAddress` /
nametag via `sphere.resolve()` (a Nostr binding lookup), and may key user
records on that resolved address instead. Resolving requires a full
`Sphere.init()` (storage, transport, oracle), which is why this example
doesn't do it. Either way, the rule doesn't change: the key you trust is
always something the backend **derived** itself — the recovered pubkey, or
an address resolved from it — never a value a client handed you in a
request.

## Generating an example like this

The `sphere-connect` Claude Code plugin's `backend-auth.md` skill can
generate a backend-auth pair like this one from a prompt.
