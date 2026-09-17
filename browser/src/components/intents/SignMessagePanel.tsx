import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Textarea } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { errorText, isUnresolved, toIntentFailure, type IntentFailure } from '../../lib/intentFailure';
import { OutcomeUnknownBanner } from '../ui/OutcomeUnknownBanner';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function SignMessagePanel({ intent }: Props) {
  const [message, setMessage] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [failure, setFailure] = useState<IntentFailure | null>(null);
  const [loading, setLoading] = useState(false);

  // Signing again is cheap, but a lost answer may still have cost the user an approval prompt —
  // and a backend that treats one nonce as one signature will reject the second one. Lock and let
  // the human decide, exactly as the value-moving panels do.
  const unresolved = isUnresolved(failure);

  const execute = async () => {
    if (!message || unresolved) return;
    setLoading(true);
    setFailure(null);
    setRaw(null);
    try {
      const result = await intent(INTENT_ACTIONS.SIGN_MESSAGE, { message });
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
        <h2 className="text-lg font-semibold text-white">Sign Message</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: sign_message</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Sign an arbitrary message with wallet key (e.g. for authentication or proof of ownership)</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Message to sign" rows={4} className="resize-none" />
        <Button onClick={execute} disabled={loading || unresolved || !message} className="w-full">
          {loading ? 'Signing...' : unresolved ? 'Sign Message (locked — outcome unknown)' : 'Sign Message'}
        </Button>
      </div>

      <OutcomeUnknownBanner
        failure={failure}
        action="sign_message"
        reconcile="If your backend consumed the nonce, ask it for a fresh challenge instead of signing the same one again."
        onAcknowledge={() => setFailure(null)}
      />

      <ResultDisplay result={raw} error={errorText(failure)} />
    </div>
  );
}
