# Sphere Connect Example — Backend

Minimal Fastify backend demonstrating the canonical Sphere wallet authentication recipe using `verifySphereAuth` from `@unicitylabs/sphere-sdk`.

## Run

```bash
npm install
npm run dev    # http://localhost:4000
```

## Endpoints

- `POST /auth/challenge { chainPubkey }` → `{ challenge, expiresAt }`
- `POST /auth/verify    { chainPubkey, signature }` → `{ jwt }`
- `GET  /me` (Bearer JWT) → `{ chainPubkey, directAddress }`

## End-to-end test

1. Start a Sphere wallet (either the `sphere` web app or the `nodejs/` mock wallet).
2. Start this backend (`npm run dev`).
3. Start the `browser/` dApp (`cd ../browser && npm run dev`).
4. In the dApp, open the **Backend Auth** panel and click **Sign In with Wallet**.
5. Wallet pops up to approve the message.
6. JWT is stored in `sessionStorage`; the panel then calls `/me` and displays your identity.

## What the backend does NOT do

- Refresh tokens, session revocation, distributed nonce storage — out of scope for a single-file demo.
- L1 (`alpha1...`) signature variants — separate scheme.
