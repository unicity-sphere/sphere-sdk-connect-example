const COLORS = [
  'bg-orange-500/15 text-orange-400',
  'bg-blue-500/15 text-blue-400',
  'bg-green-500/15 text-green-400',
  'bg-purple-500/15 text-purple-400',
  'bg-pink-500/15 text-pink-400',
  'bg-teal-500/15 text-teal-400',
];

function colorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

interface CoinBadgeProps {
  symbol: string;
  iconUrl?: string | null;
  size?: 'sm' | 'md';
}

export function CoinBadge({ symbol, iconUrl, size = 'md' }: CoinBadgeProps) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';

  return (
    <span className="inline-flex items-center gap-1.5">
      {iconUrl ? (
        <img src={iconUrl} alt={symbol} className={`${dim} rounded-full object-cover`} />
      ) : (
        <span className={`${dim} rounded-full flex items-center justify-center font-bold ${colorFor(symbol)}`}>
          {symbol.charAt(0)}
        </span>
      )}
      <span className="font-semibold text-white">{symbol}</span>
    </span>
  );
}
