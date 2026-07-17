import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { CoinSelect } from '../ui/CoinSelect';
import { parseAmount, safeParseAmount } from '../../lib/format';
import { interpretSendResult, SIMULATED_PENDING_RESULT, type SendOutcome } from '../../lib/sendResult';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export function SendPanel({ intent, query }: Props) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [coinId, setCoinId] = useState('');
  const [decimals, setDecimals] = useState(0);
  const [memo, setMemo] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulatePending, setSimulatePending] = useState(false);

  const execute = async () => {
    if (!recipient || !amount || !coinId) return;
    setLoading(true);
    setError(null);
    setRaw(null);
    setOutcome(null);
    try {
      const to = recipient.startsWith('@') ? recipient : '@' + recipient;
      // Connect `send` takes the amount in BASE UNITS — convert the human input
      // here, at the dApp's edge (string-based, exact). The wallet only displays
      // it. (The SDK also exports `parseTokenAmount` for the same purpose.)
      const params: Record<string, unknown> = { to, amount: parseAmount(amount, decimals), coinId };
      if (memo) params.memo = memo;

      // DEMO ONLY: short-circuit to the pending fixture so the state is reachable.
      const result = simulatePending
        ? SIMULATED_PENDING_RESULT
        : await intent(INTENT_ACTIONS.SEND, params);

      setRaw(result);
      setOutcome(interpretSendResult(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Send (L3)</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: send</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Transfer L3 tokens to a recipient</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient (@nametag, DIRECT://..., pubkey)" />
        <div className="flex gap-2">
          <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1" />
          <CoinSelect value={coinId} onChange={(c, d) => { setCoinId(c); setDecimals(d); }} query={query} />
        </div>
        {amount && safeParseAmount(amount, decimals) && (
          <p className="text-[10px] font-mono text-white/30">= {safeParseAmount(amount, decimals)} base units (sent to wallet)</p>
        )}
        <Input type="text" value={memo} onChange={(e) => setMemo(e.target.value)}
          placeholder="Memo (optional)" />
        <Button onClick={execute} disabled={loading || !recipient || !amount || !coinId} className="w-full">
          {loading ? 'Sending...' : 'Send'}
        </Button>
      </div>

      {/* DEMO SCAFFOLDING — a delivery-pending send cannot be triggered on demand,
          so this fakes the wallet's response locally. Never ship this in a real dApp. */}
      <label className="mt-4 flex items-start gap-2 p-2.5 rounded-lg border border-dashed border-white/15 cursor-pointer">
        <input
          type="checkbox"
          checked={simulatePending}
          onChange={(e) => setSimulatePending(e.target.checked)}
          className="mt-0.5 accent-orange-500"
        />
        <span className="text-[11px] leading-snug text-white/45">
          <span className="font-semibold text-white/70">Demo:</span> simulate a delivery-pending result
          (does not contact the wallet) — shows how your dApp must handle a certified-but-undelivered send.
        </span>
      </label>

      <SendOutcomeBanner outcome={outcome} />
      <ResultDisplay result={raw} error={error} />
    </div>
  );
}

function SendOutcomeBanner({ outcome }: { outcome: SendOutcome | null }) {
  if (!outcome) return null;

  if (outcome.kind === 'delivery-pending') {
    return (
      <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <p className="text-sm font-semibold text-amber-400">Delivery pending — the money already moved</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">
          The spend certified on-chain, but delivery to the recipient has not landed yet. The wallet journaled
          it and will retry under the original transfer. There is no <code className="font-mono">transferId</code> to
          show — pending results carry an empty id by design.
        </p>
        <p className="mt-2 text-xs font-semibold text-amber-400">
          Do NOT re-send. A second send consumes a different source token and pays twice.
        </p>
        <p className="mt-1 text-[10px] font-mono text-white/30">status: {outcome.status}</p>
      </div>
    );
  }

  if (outcome.kind === 'delivered') {
    return (
      <div className="mt-4 p-3 rounded-xl bg-green-500/10 border border-green-500/25">
        <p className="text-sm font-semibold text-green-400">Delivered</p>
        <p className="mt-1 text-[10px] font-mono break-all text-white/45">
          transferId: {outcome.transferId} · status: {outcome.status}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 rounded-xl bg-white/4 border border-white/10">
      <p className="text-xs text-white/45">
        Unrecognised result shape — see the raw JSON below. If you hit this, the wallet contract may have
        changed; <code className="font-mono">src/lib/sendResult.ts</code> needs updating.
      </p>
    </div>
  );
}
