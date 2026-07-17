import { useCallback, useState } from 'react';
import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import type { AutoConnectResult } from '@unicitylabs/sphere-sdk/connect/browser';
import { ERROR_CODES, INTENT_ACTIONS, PERMISSION_SCOPES, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';

/**
 * Backend-auth example frontend — brokers a Sphere wallet signature to the
 * backend from Task 5. This page never handles keys or claims an identity
 * itself; it only ferries a challenge to the wallet and a signature back to
 * the backend, which independently recovers the signer from the signature.
 *
 * Flow:
 *  1. autoConnect() to the wallet (iframe/extension/popup, whichever applies).
 *  2. GET /challenge?chainPubkey=<connected identity> — binds the challenge
 *     text to this wallet as a hint (the backend re-verifies, never trusts it).
 *  3. Ask the wallet to sign the returned `challenge` string VERBATIM via the
 *     `sign_message` intent. Do not trim/re-encode it — the backend
 *     reconstructs the exact same string and any byte drift silently recovers
 *     a different pubkey (see backend-auth/backend/src/challenge.ts).
 *  4. POST /verify { nonce, signature } — the backend recovers the signer and
 *     mints a session JWT keyed on that recovered pubkey.
 */

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8787';
const WALLET_URL = (import.meta.env.VITE_WALLET_URL as string | undefined) || 'https://sphere.unicity.network';

type Step =
  | 'idle'
  | 'connecting'
  | 'requesting-challenge'
  | 'awaiting-signature'
  | 'verifying'
  | 'authenticated'
  | 'error';

interface Session {
  jwt: string;
  chainPubkey: string;
}

interface ChallengeResponse {
  nonce: string;
  challenge: string;
  expiresAt: number;
}

interface VerifyResponse {
  jwt: string;
  chainPubkey: string;
  expiresIn: number;
}

/** Result shape of the `sign_message` intent (confirmed against the wallet handler
 *  and browser/src/components/intents/SignMessagePanel.tsx). `publicKey` is what the
 *  wallet SAYS signed the message — never trusted; the backend recovers it itself. */
interface SignMessageResult {
  signature: string;
  publicKey: string;
}

const STEP_LABEL: Record<Exclude<Step, 'idle' | 'authenticated' | 'error'>, string> = {
  connecting: 'Connecting to your Sphere wallet…',
  'requesting-challenge': 'Requesting a sign-in challenge…',
  'awaiting-signature': 'Check your wallet — approve the signature request…',
  verifying: 'Verifying your signature with the backend…',
};

/** Fetch helper that turns network failures and non-2xx backend responses into
 *  readable Error messages instead of leaking raw fetch/JSON exceptions. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`Could not reach the backend at ${BACKEND_URL}. Is it running?`);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Backend request failed: ${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/** Connect intent/handshake errors carry a numeric `.code` (see ConnectError in
 *  @unicitylabs/sphere-sdk/connect). Duck-type on `.code` rather than `instanceof` —
 *  the SDK's own ConnectClient comment flags instanceof as unsafe across bundles. */
function isConnectErrorCode(err: unknown, code: number): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === code;
}

function describeError(err: unknown): string {
  if (isConnectErrorCode(err, ERROR_CODES.USER_REJECTED) || isConnectErrorCode(err, ERROR_CODES.INTENT_CANCELLED)) {
    return 'You declined the signature request in your wallet.';
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

function truncate(value: string, head = 18, tail = 10): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export default function App() {
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [connection, setConnection] = useState<AutoConnectResult | null>(null);

  const signIn = useCallback(async () => {
    setError(null);
    setSession(null);

    let auto: AutoConnectResult | null = null;
    try {
      setStep('connecting');
      auto = await autoConnect({
        dapp: {
          name: 'Backend Auth Example',
          description: 'Sign in with your Sphere wallet',
          url: location.origin,
        },
        walletUrl: WALLET_URL,
        network: SPHERE_NETWORKS.testnet2,
        permissions: [PERMISSION_SCOPES.IDENTITY_READ, PERMISSION_SCOPES.SIGN_REQUEST],
      });
      setConnection(auto);

      // Identity lives on connection.identity, NOT on the autoConnect result root.
      const chainPubkey = auto.connection.identity.chainPubkey;

      setStep('requesting-challenge');
      const { nonce, challenge } = await fetchJson<ChallengeResponse>(
        `${BACKEND_URL}/challenge?chainPubkey=${encodeURIComponent(chainPubkey)}`,
      );

      setStep('awaiting-signature');
      // Sign the challenge text VERBATIM — no trim/normalize. Byte-exactness is the
      // whole safety property the backend relies on (see challenge.ts comments).
      const { signature } = await auto.client.intent<SignMessageResult>(INTENT_ACTIONS.SIGN_MESSAGE, {
        message: challenge,
      });
      // `publicKey` from the wallet's response is intentionally ignored — the
      // backend recovers the signer from the signature itself; that recovery,
      // not this field, is what proves identity.

      setStep('verifying');
      const verified = await fetchJson<VerifyResponse>(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce, signature }),
      });

      setSession({ jwt: verified.jwt, chainPubkey: verified.chainPubkey });
      setStep('authenticated');
    } catch (err) {
      setError(describeError(err));
      setStep('error');
      // Best-effort cleanup so a retry starts from a fresh connection rather than
      // a half-open transport/popup left over from the failed attempt.
      await auto?.disconnect().catch(() => {});
      setConnection(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await connection?.disconnect().catch(() => {});
    setConnection(null);
    setSession(null);
    setError(null);
    setStep('idle');
  }, [connection]);

  const busy = step !== 'idle' && step !== 'authenticated' && step !== 'error';

  return (
    <div className="page">
      <div className="card">
        <h1>Backend Auth Example</h1>
        <p className="subtitle">Sign in with your Sphere wallet — proven by signature, not claimed.</p>

        {step === 'authenticated' && session ? (
          <div className="session">
            <dl>
              <dt>chainPubkey</dt>
              <dd>{session.chainPubkey}</dd>
              <dt>session jwt</dt>
              <dd>{truncate(session.jwt)}</dd>
            </dl>
            <div className="proof-note">
              <span className="badge">🔒</span>
              <span>
                This identity was <strong>proven</strong> by recovering the signer's public key from the
                wallet's signature over the server-issued challenge — it was never simply asserted by the
                client.
              </span>
            </div>
            <button className="secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : (
          <>
            {busy && (
              <div className="step">
                <span className="spinner" aria-hidden="true" />
                <span>{STEP_LABEL[step as keyof typeof STEP_LABEL]}</span>
              </div>
            )}
            <button className="primary" onClick={signIn} disabled={busy}>
              {step === 'error' ? 'Try again' : 'Sign in with your Sphere wallet'}
            </button>
            {error && <div className="error-box">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
