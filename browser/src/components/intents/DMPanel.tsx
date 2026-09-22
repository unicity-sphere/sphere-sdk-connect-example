import { useState } from 'react';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input, Textarea } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { errorText, isUnresolved, toIntentFailure, type IntentFailure } from '../../lib/intentFailure';
import { OutcomeUnknownBanner } from '../ui/OutcomeUnknownBanner';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

export function DMPanel({ intent }: Props) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [failure, setFailure] = useState<IntentFailure | null>(null);
  const [loading, setLoading] = useState(false);

  // A DM whose outcome is unknown LOCKS this panel — it may already have been delivered.
  const unresolved = isUnresolved(failure);

  const execute = async () => {
    if (!recipient || !message || unresolved) return;
    setLoading(true);
    setFailure(null);
    setRaw(null);
    try {
      const to = recipient.startsWith('@') ? recipient : '@' + recipient;
      const result = await intent(INTENT_ACTIONS.DM, { to, message });
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
        <h2 className="text-lg font-semibold text-white">Direct Message</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: dm</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Send a direct message via Nostr</p>
      <p className="text-[11px] text-amber-400 mb-4">Requires wallet approval</p>

      <div className="space-y-3">
        <Input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="To (@nametag)" />
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Message" rows={3} className="resize-none" />
        <Button onClick={execute} disabled={loading || unresolved || !recipient || !message} className="w-full">
          {loading ? 'Sending...' : unresolved ? 'Send DM (locked — outcome unknown)' : 'Send DM'}
        </Button>
      </div>

      <OutcomeUnknownBanner
        failure={failure}
        action="dm"
        reconcile="Check the conversation before sending again, or the recipient gets the message twice."
        onAcknowledge={() => setFailure(null)}
      />

      <ResultDisplay result={raw} error={errorText(failure)} />
    </div>
  );
}
