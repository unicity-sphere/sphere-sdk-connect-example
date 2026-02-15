import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: number;
  event: string;
  data: unknown;
  timestamp: Date;
}

interface EventLogProps {
  on: (event: string, handler: (data: unknown) => void) => () => void;
}

let entryId = 0;

export function EventLog({ on }: EventLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const events = [
      'transfer:incoming',
      'transfer:confirmed',
      'transfer:failed',
      'nametag:registered',
      'payment_request:incoming',
    ];

    const unsubs = events.map((event) =>
      on(event, (data) => {
        setEntries((prev) => [
          ...prev.slice(-49), // keep last 50
          { id: ++entryId, event, data, timestamp: new Date() },
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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Events</h2>
        {entries.length > 0 && (
          <button
            onClick={() => setEntries([])}
            className="text-sm text-gray-400 hover:text-gray-600 font-medium cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="space-y-2 max-h-60 overflow-y-auto"
      >
        {entries.length === 0 ? (
          <div className="text-gray-400 text-sm py-4 text-center">
            Listening for events...
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 bg-gray-50 rounded-xl text-xs"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-indigo-600">{entry.event}</span>
                <span className="text-gray-400">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-gray-600 overflow-auto">
                {JSON.stringify(entry.data, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
