export function formatAmount(raw: string, decimals: number): string {
  if (!raw || decimals === 0) return raw ?? '0';
  const str = raw.padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const fracPart = str.slice(str.length - decimals).replace(/0+$/, '');
  const intFormatted = Number(intPart).toLocaleString('en-US');
  return fracPart ? `${intFormatted}.${fracPart}` : intFormatted;
}

/**
 * Convert a human-readable amount to BASE UNITS (smallest indivisible unit) —
 * the inverse of {@link formatAmount}. Connect `send` / `payment_request` (like
 * `mint`) take the amount in base units, so the dApp converts at this UI edge.
 * String-based (no float) so precision is exact. Throws on invalid input.
 *
 * Apps that already depend on the SDK can use its `parseTokenAmount` instead —
 * this local copy keeps the example dependency-light.
 */
export function parseAmount(human: string, decimals: number): string {
  const str = (human ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid amount: "${human}"`);
  const [intPart, fracPart = ''] = str.split('.');
  if (fracPart.length > decimals) {
    throw new Error(`Amount "${human}" has more than ${decimals} decimal place(s)`);
  }
  return BigInt(intPart + fracPart.padEnd(decimals, '0')).toString();
}

/** Non-throwing {@link parseAmount} for live UI hints: `null` when not valid yet. */
export function safeParseAmount(human: string, decimals: number): string | null {
  try {
    return parseAmount(human, decimals);
  } catch {
    return null;
  }
}

export function formatFiat(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChange(change: number | null | undefined): { text: string; color: string } {
  if (change == null) return { text: '—', color: 'text-gray-400' };
  const sign = change >= 0 ? '+' : '';
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color: change >= 0 ? 'text-green-600' : 'text-red-600',
  };
}

export function truncate(str: string, start = 8, end = 6): string {
  if (!str || str.length <= start + end + 3) return str ?? '';
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

export function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function chatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

