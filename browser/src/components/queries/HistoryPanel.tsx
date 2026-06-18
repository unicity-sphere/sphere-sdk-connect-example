import { useMemo, useState, type ReactNode } from 'react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { Button, CustomSelect } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';
import { StatusBadge } from '../ui/StatusBadge';
import { CoinBadge } from '../ui/CoinBadge';
import { formatAmount, relativeTime, truncate } from '../../lib/format';
import type { Asset, HistoryEntry } from '../../lib/types';

interface Props {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

interface CoinMeta {
  decimals: number;
  symbol: string;
  iconUrl?: string | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function HistoryPanel({ query }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [coinMap, setCoinMap] = useState<Record<string, CoinMeta>>({});
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  const execute = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch history + assets in parallel.
      // Assets are needed to resolve `decimals` per coinId so amounts render
      // human-readable (same as the wallet UI), instead of raw smallest-unit strings.
      const [history, assets] = await Promise.all([
        query<HistoryEntry[]>(RPC_METHODS.GET_HISTORY),
        query<Asset[]>(RPC_METHODS.GET_ASSETS),
      ]);

      const map: Record<string, CoinMeta> = {};
      for (const a of assets ?? []) {
        map[a.coinId] = { decimals: a.decimals, symbol: a.symbol, iconUrl: a.iconUrl };
      }

      setCoinMap(map);
      setEntries(history ?? []);
      setRaw(history);
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    let sent = 0;
    let received = 0;
    let other = 0;
    for (const e of entries) {
      if (e.type === 'SENT') sent++;
      else if (e.type === 'RECEIVED') received++;
      else other++;
    }
    return { total: entries.length, sent, received, other };
  }, [entries]);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = entries.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">History</h2>
        <span className="text-[10px] font-mono text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded">sphere_getHistory</span>
      </div>
      <p className="text-xs text-white/45 mb-4">Transaction history with paginated table view</p>

      <Button onClick={execute} disabled={loading} className="w-full">
        {loading ? 'Loading...' : 'Fetch History'}
      </Button>

      {entries.length > 0 && !error && (
        <>
          <SummaryCards stats={stats} />
          <HistoryTable entries={pageEntries} coinMap={coinMap} />
          <Pagination
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={entries.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
          />
        </>
      )}

      <ResultDisplay result={raw} error={error} />
    </div>
  );
}

// ── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ stats }: { stats: { total: number; sent: number; received: number; other: number } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
      <StatCard label="Total" value={stats.total} accent="bg-white/3 text-white" />
      <StatCard label="Sent" value={stats.sent} accent="bg-orange-500/10 text-orange-400" />
      <StatCard label="Received" value={stats.received} accent="bg-green-500/15 text-green-400" />
      <StatCard label="Other" value={stats.other} accent="bg-white/3 text-white/45" />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-xl p-3 ${accent}`}>
      <div className="text-[11px] uppercase tracking-wide font-medium opacity-70">{label}</div>
      <div className="font-mono text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

function HistoryTable({ entries, coinMap }: { entries: HistoryEntry[]; coinMap: Record<string, CoinMeta> }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-sm">
        <thead className="bg-white/3 text-xs uppercase tracking-wide text-white/45">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-right px-3 py-2 font-medium">Amount</th>
            <th className="text-left px-3 py-2 font-medium">Coin</th>
            <th className="text-left px-3 py-2 font-medium">Counterparty</th>
            <th className="text-right px-3 py-2 font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">
          {entries.map((e, i) => {
            const meta = coinMap[e.coinId];
            const decimals = meta?.decimals ?? 0;
            const symbol = meta?.symbol ?? e.symbol ?? e.coinId;
            const iconUrl = meta?.iconUrl;
            const sign = e.type === 'SENT' ? '-' : e.type === 'RECEIVED' ? '+' : '';
            const amountColor = e.type === 'SENT' ? 'text-orange-400' : e.type === 'RECEIVED' ? 'text-green-400' : 'text-white/70';

            return (
              <tr key={e.id ?? i} className="hover:bg-white/3">
                <td className="px-3 py-2"><StatusBadge status={e.type} /></td>
                <td className={`px-3 py-2 text-right font-mono ${amountColor}`}>
                  {sign}{formatAmount(e.amount, decimals)}
                </td>
                <td className="px-3 py-2"><CoinBadge symbol={symbol} iconUrl={iconUrl} size="sm" /></td>
                <td className="px-3 py-2 text-white/55">
                  {renderCounterparty(e)}
                </td>
                <td className="px-3 py-2 text-right text-xs text-white/45 whitespace-nowrap">
                  {relativeTime(e.timestamp)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderCounterparty(e: HistoryEntry): ReactNode {
  if (e.type === 'SENT' && e.recipientNametag) return <span>to @{e.recipientNametag}</span>;
  if (e.type === 'RECEIVED' && e.senderNametag) return <span>from @{e.senderNametag}</span>;
  if (e.senderPubkey) return <span className="font-mono text-xs">{truncate(e.senderPubkey, 6, 4)}</span>;
  return <span className="text-white/30">—</span>;
}

// ── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page, totalPages, pageSize, totalCount, onPageChange, onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-white/45">
      <div className="flex items-center gap-2">
        <span>Rows per page:</span>
        <CustomSelect
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          size="sm"
          className="w-20"
          options={PAGE_SIZE_OPTIONS.map((s) => ({ value: String(s), label: String(s) }))}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono">{start}–{end} of {totalCount}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            className="px-2 py-1 rounded-md border border-white/8 hover:bg-white/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            ← Prev
          </button>
          <span className="font-mono px-2">{page + 1} / {totalPages}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded-md border border-white/8 hover:bg-white/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
