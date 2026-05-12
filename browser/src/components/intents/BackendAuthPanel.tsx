import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { ResultDisplay } from '../ui/ResultDisplay';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  chainPubkey: string | undefined;
}

export function BackendAuthPanel({ intent, chainPubkey }: Props) {
  const [jwt, setJwt] = useState<string | null>(() => sessionStorage.getItem('connect_example_jwt'));
  const [me, setMe] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!chainPubkey) { setError('Wallet not connected'); return; }
    setLoading(true);
    setError(null);
    setMe(null);
    try {
      const ch = await fetch(`${BACKEND_URL}/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainPubkey }),
      }).then((r) => r.json());

      const signed = await intent<{ signature: string; publicKey: string }>(
        INTENT_ACTIONS.SIGN_MESSAGE,
        { message: ch.challenge },
      );

      const v = await fetch(`${BACKEND_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainPubkey, signature: signed.signature }),
      });
      if (!v.ok) throw new Error((await v.json()).error);
      const { jwt: token } = await v.json();
      sessionStorage.setItem('connect_example_jwt', token);
      setJwt(token);

      const meRes = await fetch(`${BACKEND_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      setMe(meRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem('connect_example_jwt');
    setJwt(null);
    setMe(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Backend Auth (verifySphereAuth)</h2>
        <span className="text-[10px] font-mono text-orange-500 bg-orange-50 px-2 py-0.5 rounded">end-to-end</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Demonstrates the full flow: request challenge from backend, sign via wallet, exchange signature for JWT, call /me.
        Requires the local backend at <code>{BACKEND_URL}</code>.
      </p>

      <div className="flex gap-3 mb-4">
        <button
          onClick={signIn}
          disabled={loading || !chainPubkey}
          className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in…' : jwt ? 'Re-authenticate' : 'Sign In with Wallet'}
        </button>
        {jwt && (
          <button onClick={logout} className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 cursor-pointer">
            Logout
          </button>
        )}
      </div>

      {jwt && <p className="text-xs text-green-600 mb-2">JWT stored in sessionStorage</p>}

      <ResultDisplay result={me} error={error} />
    </div>
  );
}
