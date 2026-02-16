import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: number;
  event: string;
  data: unknown;
  timestamp: Date;
}

interface Props {
  on: (event: string, handler: (data: unknown) => void) => () => void;
}

const ALL_EVENTS = [
  // Transfers
  'transfer:incoming',
  'transfer:confirmed',
  'transfer:failed',
  // Payment requests
  'payment_request:incoming',
  'payment_request:accepted',
  'payment_request:rejected',
  'payment_request:paid',
  'payment_request:response',
  // Messages
  'message:dm',
  'message:read',
  'message:typing',
  'composing:started',
  'message:broadcast',
  // Sync
  'sync:started',
  'sync:completed',
  'sync:provider',
  'sync:error',
  'sync:remote-update',
  // Connection
  'connection:changed',
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

const EVENT_COLORS: Record<string, string> = {
  // Transfers
  'transfer:incoming': 'bg-green-100 text-green-700',
  'transfer:confirmed': 'bg-green-100 text-green-700',
  'transfer:failed': 'bg-red-100 text-red-700',
  // Payment requests
  'payment_request:incoming': 'bg-orange-100 text-orange-700',
  'payment_request:accepted': 'bg-green-100 text-green-700',
  'payment_request:rejected': 'bg-red-100 text-red-700',
  'payment_request:paid': 'bg-green-100 text-green-700',
  'payment_request:response': 'bg-orange-100 text-orange-700',
  // Messages
  'message:dm': 'bg-indigo-100 text-indigo-700',
  'message:read': 'bg-indigo-100 text-indigo-700',
  'message:typing': 'bg-indigo-100 text-indigo-700',
  'composing:started': 'bg-indigo-100 text-indigo-700',
  'message:broadcast': 'bg-indigo-100 text-indigo-700',
  // Sync
  'sync:started': 'bg-gray-100 text-gray-600',
  'sync:completed': 'bg-gray-100 text-gray-600',
  'sync:provider': 'bg-gray-100 text-gray-600',
  'sync:error': 'bg-red-100 text-red-700',
  'sync:remote-update': 'bg-gray-100 text-gray-600',
  // Connection
  'connection:changed': 'bg-yellow-100 text-yellow-700',
  // Identity & addresses
  'identity:changed': 'bg-blue-100 text-blue-700',
  'nametag:registered': 'bg-purple-100 text-purple-700',
  'nametag:recovered': 'bg-purple-100 text-purple-700',
  'address:activated': 'bg-blue-100 text-blue-700',
  'address:hidden': 'bg-blue-100 text-blue-700',
  'address:unhidden': 'bg-blue-100 text-blue-700',
  // Group chat
  'groupchat:message': 'bg-teal-100 text-teal-700',
  'groupchat:joined': 'bg-teal-100 text-teal-700',
  'groupchat:left': 'bg-teal-100 text-teal-700',
  'groupchat:kicked': 'bg-red-100 text-red-700',
  'groupchat:group_deleted': 'bg-red-100 text-red-700',
  'groupchat:updated': 'bg-teal-100 text-teal-700',
  'groupchat:connection': 'bg-teal-100 text-teal-700',
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Event Log</h2>
        <span className="text-[10px] font-mono text-purple-500 bg-purple-50 px-2 py-0.5 rounded">events</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Real-time wallet events ({ALL_EVENTS.length} subscribed)</p>

      <div className="flex items-center gap-2 mb-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500">
          <option value="all">All events</option>
          {ALL_EVENTS.map((ev) => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
        {entries.length > 0 && (
          <button onClick={() => setEntries([])}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 cursor-pointer">
            Clear
          </button>
        )}
      </div>

      <div ref={containerRef} className="space-y-2 max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-gray-400 text-sm py-8 text-center">
            Listening for events...
          </div>
        ) : (
          filtered.map((entry) => {
            const badgeStyle = EVENT_COLORS[entry.event] ?? 'bg-gray-100 text-gray-600';
            return (
              <div key={entry.id} className="p-3 bg-gray-50 rounded-xl text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-md font-medium ${badgeStyle}`}>
                    {entry.event}
                  </span>
                  <span className="text-gray-400">{entry.timestamp.toLocaleTimeString()}</span>
                </div>
                <pre className="text-gray-600 overflow-auto max-h-32">
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
