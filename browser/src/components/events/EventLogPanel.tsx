import { useState, useEffect, useRef } from 'react';
import { Button, CustomSelect } from '@unicitylabs/sphere-ui';

interface LogEntry {
  id: number;
  event: string;
  data: unknown;
  timestamp: Date;
}

interface Props {
  on: (event: string, handler: (data: unknown) => void) => () => void;
}

/**
 * The events this demo subscribes to, using the CURRENT sphere-sdk 0.14 names.
 *
 * The payments-v2 flip renamed most of the money-side events:
 *   transfer:confirmed + transfer:delivery_pending + transfer:failed -> transfer:updated
 *   split:checkpoint-stuck / delivery:undeliverable / delivery:deferred -> transfer:attention
 *   sync:*                                                            -> inventory:updated
 *   realtime:status + storage:degraded                                -> connection:status
 *   payment_request:paid / :rejected / :expired                       -> payment_request:updated
 *
 * The 16 old names listed in the host's COMPAT_ATTACHERS still resolve — the wallet re-emits
 * them from the new event through a compatibility adapter. The other 26 pre-0.14 names do NOT:
 * `subscribe` accepts any string, so a stale subscription to e.g. `invoice:payment`,
 * `swap:failed`, `sync:started`, `send:partial-remainder`, `transfer:invalid` or
 * `payment_request:response` is ACCEPTED and then silently never fires. Use the names below;
 * they are what the wallet actually emits.
 */
export const ALL_EVENTS = [
  // Transfers
  'transfer:incoming',
  'transfer:updated',
  'transfer:attention',
  // Inventory & history
  'inventory:updated',
  'history:updated',
  // Payment requests
  'payment_request:incoming',
  'payment_request:updated',
  // Messages
  'message:dm',
  'message:read',
  'message:typing',
  'composing:started',
  'message:broadcast',
  // Connection & wallet state
  'connection:status',
  'connection:changed',
  'wallet:locked',
  'wallet:unlocked',
  'wallet:disconnected',
  // Identity & addresses
  'identity:changed',
  'nametag:registered',
  'nametag:recovered',
  'address:activated',
  'address:hidden',
  'address:unhidden',
  // Group chat
  'groupchat:message',
  'groupchat:joined',
  'groupchat:left',
  'groupchat:kicked',
  'groupchat:group_deleted',
  'groupchat:updated',
  'groupchat:connection',
];

/**
 * `transfer:updated` is the COMBINED outcome event (0.14): it replaced
 * transfer:confirmed AND transfer:failed AND transfer:delivery_pending, so the
 * name alone says nothing about whether money moved — see badgeFor().
 */
export const EVENT_COLORS: Record<string, string> = {
  // Transfers
  'transfer:incoming': 'bg-green-500/15 text-green-400',
  'transfer:updated': 'bg-green-500/15 text-green-400',
  // Amber: "needs a look", not "failed". Never auto-retry a send on one of these.
  'transfer:attention': 'bg-amber-500/15 text-amber-400',
  // Inventory & history
  'inventory:updated': 'bg-white/3 text-white/55',
  'history:updated': 'bg-white/3 text-white/55',
  // Payment requests
  'payment_request:incoming': 'bg-orange-500/10 text-orange-400',
  'payment_request:updated': 'bg-orange-500/10 text-orange-400',
  // Messages
  'message:dm': 'bg-indigo-500/15 text-indigo-400',
  'message:read': 'bg-indigo-500/15 text-indigo-400',
  'message:typing': 'bg-indigo-500/15 text-indigo-400',
  'composing:started': 'bg-indigo-500/15 text-indigo-400',
  'message:broadcast': 'bg-indigo-500/15 text-indigo-400',
  // Connection & wallet state
  'connection:status': 'bg-yellow-500/15 text-amber-400',
  'connection:changed': 'bg-yellow-500/15 text-amber-400',
  // Amber, not red: a lock is a pause, not a fatal teardown. wallet:disconnected is the red one.
  'wallet:locked': 'bg-amber-500/15 text-amber-400',
  'wallet:unlocked': 'bg-green-500/15 text-green-400',
  'wallet:disconnected': 'bg-red-500/15 text-red-400',
  // Identity & addresses
  'identity:changed': 'bg-blue-500/15 text-blue-400',
  'nametag:registered': 'bg-purple-500/15 text-purple-400',
  'nametag:recovered': 'bg-purple-500/15 text-purple-400',
  'address:activated': 'bg-blue-500/15 text-blue-400',
  'address:hidden': 'bg-blue-500/15 text-blue-400',
  'address:unhidden': 'bg-blue-500/15 text-blue-400',
  // Group chat
  'groupchat:message': 'bg-teal-500/15 text-teal-400',
  'groupchat:joined': 'bg-teal-500/15 text-teal-400',
  'groupchat:left': 'bg-teal-500/15 text-teal-400',
  'groupchat:kicked': 'bg-red-500/15 text-red-400',
  'groupchat:group_deleted': 'bg-red-500/15 text-red-400',
  'groupchat:updated': 'bg-teal-500/15 text-teal-400',
  'groupchat:connection': 'bg-teal-500/15 text-teal-400',
};

/**
 * Badge style for one logged event. The name alone is not enough for
 * `transfer:updated`: a FAILED send carries the same event name as a confirmed
 * one, and green-for-failed is the miscolour that actively misleads — a dApp
 * dev reads this log to answer "did it go through?".
 *
 * The colour is driven by the SETTLED set, not by a blocklist: `TransferStatus`
 * is `pending | submitted | confirmed | delivered | completed | failed`, and only
 * the last three mean the money has landed. `submitted` is certification IN FLIGHT
 * — painting it green answers "did it go through?" with yes before it is true —
 * and a payload carrying no `status` at all has told us nothing, so neither may
 * fall through to the green table colour.
 */
const SETTLED_TRANSFER_STATUSES = new Set(['confirmed', 'delivered', 'completed']);

export function badgeFor(event: string, data: unknown): string {
  const fallback = EVENT_COLORS[event] ?? 'bg-white/3 text-white/55';
  if (event !== 'transfer:updated') return fallback;
  const result = data as { status?: unknown; deliveryPending?: unknown } | null | undefined;
  if (result?.status === 'failed') return 'bg-red-500/15 text-red-400';
  if (result?.deliveryPending === true) return 'bg-amber-500/15 text-amber-400';
  if (typeof result?.status === 'string' && SETTLED_TRANSFER_STATUSES.has(result.status)) {
    return fallback;
  }
  return 'bg-amber-500/15 text-amber-400';
}


let nextId = 0;

export function EventLogPanel({ on }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubs = ALL_EVENTS.map((event) =>
      on(event, (data) => {
        setEntries((prev) => [
          ...prev.slice(-99),
          { id: ++nextId, event, data, timestamp: new Date() },
        ]);
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [on]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.event === filter);

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Event Log</h2>
        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded">events</span>
      </div>
      <p className="text-xs text-white/45 mb-4">
        Real-time wallet events ({ALL_EVENTS.length} subscribed) — sphere-sdk 0.14 names
      </p>

      <div className="flex items-center gap-2 mb-3">
        <CustomSelect
          value={filter}
          onChange={setFilter}
          className="flex-1"
          options={[
            { value: 'all', label: 'All events' },
            ...ALL_EVENTS.map((ev) => ({ value: ev, label: ev })),
          ]}
        />
        {entries.length > 0 && (
          <Button onClick={() => setEntries([])} variant="secondary">
            Clear
          </Button>
        )}
      </div>

      <div ref={containerRef} className="space-y-2 max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-white/45 text-sm py-8 text-center">
            Listening for events...
          </div>
        ) : (
          filtered.map((entry) => {
            const badgeStyle = badgeFor(entry.event, entry.data);
            return (
              <div key={entry.id} className="p-3 bg-white/3 rounded-xl text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-md font-medium ${badgeStyle}`}>
                    {entry.event}
                  </span>
                  <span className="text-white/45">{entry.timestamp.toLocaleTimeString()}</span>
                </div>
                <pre className="text-white/55 overflow-auto max-h-32">
                  {JSON.stringify(entry.data, null, 2)}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
