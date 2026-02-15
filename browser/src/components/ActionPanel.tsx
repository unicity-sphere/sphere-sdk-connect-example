import { useState } from 'react';
import { INTENT_ACTIONS, RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';

interface ActionPanelProps {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

type Tab = 'send' | 'dm' | 'resolve';

export function ActionPanel({ intent, query }: ActionPanelProps) {
  const [tab, setTab] = useState<Tab>('send');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Send form
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [coinId, setCoinId] = useState('UCT');

  // DM form
  const [dmTo, setDmTo] = useState('');
  const [dmMessage, setDmMessage] = useState('');

  // Resolve form
  const [resolveId, setResolveId] = useState('');

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  const handleSend = async () => {
    if (!recipient || !amount) return;
    setLoading(true);
    clearResult();
    try {
      const res = await intent(INTENT_ACTIONS.SEND, {
        to: recipient.startsWith('@') ? recipient : '@' + recipient,
        amount,
        coinId,
      });
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDM = async () => {
    if (!dmTo || !dmMessage) return;
    setLoading(true);
    clearResult();
    try {
      const res = await intent(INTENT_ACTIONS.DM, {
        to: dmTo.startsWith('@') ? dmTo : '@' + dmTo,
        message: dmMessage,
      });
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DM failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveId) return;
    setLoading(true);
    clearResult();
    try {
      const identifier = resolveId.startsWith('@') ? resolveId : '@' + resolveId;
      const res = await query(RPC_METHODS.RESOLVE, { identifier });
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'send', label: 'Send' },
    { key: 'dm', label: 'DM' },
    { key: 'resolve', label: 'Resolve' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); clearResult(); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Send Form */}
      {tab === 'send' && (
        <div className="space-y-3">
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient (@nametag)"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
            <input
              type="text"
              value={coinId}
              onChange={(e) => setCoinId(e.target.value)}
              placeholder="Coin"
              className="w-24 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={loading || !recipient || !amount}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Intent'}
          </button>
        </div>
      )}

      {/* DM Form */}
      {tab === 'dm' && (
        <div className="space-y-3">
          <input
            type="text"
            value={dmTo}
            onChange={(e) => setDmTo(e.target.value)}
            placeholder="To (@nametag)"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
          <textarea
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            placeholder="Message"
            rows={3}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 resize-none"
          />
          <button
            onClick={handleDM}
            disabled={loading || !dmTo || !dmMessage}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send DM Intent'}
          </button>
        </div>
      )}

      {/* Resolve Form */}
      {tab === 'resolve' && (
        <div className="space-y-3">
          <input
            type="text"
            value={resolveId}
            onChange={(e) => setResolveId(e.target.value)}
            placeholder="Nametag or address"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
          />
          <button
            onClick={handleResolve}
            disabled={loading || !resolveId}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Resolving...' : 'Resolve'}
          </button>
        </div>
      )}

      {/* Result / Error */}
      {result && (
        <pre className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 overflow-auto max-h-40">
          {result}
        </pre>
      )}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
