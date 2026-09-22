import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { CoinSelect } from '../ui/CoinSelect';
import { parseAmount, safeParseAmount } from '../../lib/format';
import { errorText, isUnresolved, toIntentFailure, type IntentFailure } from '../../lib/intentFailure';
import { OutcomeUnknownBanner } from '../ui/OutcomeUnknownBanner';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export function PaymentRequestPanel({ intent, query }: Props) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [coinId, setCoinId] = useState('');
  const [decimals, setDecimals] = useState(0);
  const [message, setMessage] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [failure, setFailure] = useState<IntentFailure | null>(null);
  const [loading, setLoading] = useState(false);

  // A request whose outcome is unknown LOCKS this panel — it may already be on its way.
  const unresolved = isUnresolved(failure);

  const execute = async () => {
    if (!recipient || !amount || !coinId || unresolved) return;
    setLoading(true);
    setFailure(null);
    setRaw(null);
    try {
      const to = recipient.startsWith('@') ? recipient : '@' + recipient;
      // Connect `payment_request` takes the amount in BASE UNITS — convert the
      // human input here, at the dApp's edge (string-based, exact).
      const params: Record<string, unknown> = { to, amount: parseAmount(amount, decimals), coinId };
      if (message) params.message = message;
      const result = await intent(INTENT_ACTIONS.PAYMENT_REQUEST, params);
      setRaw(result);
    } catch (err) {
      // INTENT_OUTCOME_UNKNOWN (4201) is not a refusal — see src/lib/intentFailure.ts.
      setFailure(toIntentFailure(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Payment Request</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: payment_request</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Request payment from another user</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient (@nametag)" />
        <div className="flex gap-2">
          <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="flex-1" />
          <CoinSelect value={coinId} onChange={(c, d) => { setCoinId(c); setDecimals(d); }} query={query} />
        </div>
        {amount && safeParseAmount(amount, decimals) && (
          <p className="text-[10px] font-mono text-white/30">= {safeParseAmount(amount, decimals)} base units (sent to wallet)</p>
        )}
        <Input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Message (optional)" />
        <Button
          onClick={execute}
          disabled={loading || unresolved || !recipient || !amount || !coinId}
          className="w-full"
        >
          {loading
            ? 'Sending...'
            : unresolved
              ? 'Send Payment Request (locked — outcome unknown)'
              : 'Send Payment Request'}
        </Button>
      </div>

      <OutcomeUnknownBanner
        failure={failure}
        action="payment_request"
        reconcile="Ask the recipient, or read the wallet's request list, before sending a second one."
        onAcknowledge={() => setFailure(null)}
      />

      <ResultDisplay result={raw} error={errorText(failure)} />
    </div>
  );
}
