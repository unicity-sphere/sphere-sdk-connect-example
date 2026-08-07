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
 * The old names still resolve — a wallet host re-emits every one of them from the new event
 * through a compatibility adapter, so a dApp built before 0.14 keeps working. New code should
 * use the names below; they are what the wallet actually emits.
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
            const badgeStyle = EVENT_COLORS[entry.event] ?? 'bg-white/3 text-white/55';
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
