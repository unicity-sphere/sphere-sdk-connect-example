/**
 * Pure coin/amount helpers for the own-wallet bot example.
 *
 * - `toBaseUnits` converts a human-readable decimal amount (e.g. "1.5") into
 *   the integer base-unit string `payments.send` expects (`payments.mint` wants
 *   the same value as a `bigint` — wrap it in `BigInt(...)`). It is string-based
 *   and exact — never routes through `Number`/`parseFloat`, which lose precision
 *   for high-decimal (e.g. 18-decimal) tokens.
 * - `fromBaseUnits` is the inverse: it renders a base-unit integer string (what
 *   `Asset.totalAmount` and `HistoryEntry.amount` carry) back as a human decimal.
 * - `resolveCoin` accepts either a 64-hex coinId or a symbol (e.g. "UCT") and
 *   resolves it to `{ coinId, decimals }` via the SDK's `TokenRegistry` singleton.
 *
 * TokenRegistry methods used here, verified against `@unicitylabs/sphere-sdk`
 * **0.14.1** (the version this package pins):
 *   - `TokenRegistry.getInstance()`
 *   - `getDefinition(coinId): TokenDefinition | undefined`
 *   - `getDefinitionBySymbol(symbol): TokenDefinition | undefined`
 *   - `getCoinIdBySymbol(symbol): string | undefined`
 */
import { TokenRegistry } from '@unicitylabs/sphere-sdk';

/** Matches a lowercase-or-uppercase 64+ char hex coinId. */
const HEX_COIN_ID_RE = /^[0-9a-f]{64,}$/i;

/**
 * Convert a human-readable decimal amount into an integer base-unit string.
 *
 * Exact, string-based arithmetic only — no `Number`/`parseFloat` on the
 * amount, which would silently lose precision for 18-decimal tokens.
 *
 * @param human - Non-negative decimal amount, e.g. "1.5" or "100".
 * @param decimals - Number of base-unit decimal places for the coin.
 * @throws if `human` isn't a plain non-negative decimal, or its fractional
 *   part has more digits than `decimals` (would silently truncate precision).
 */
export function toBaseUnits(human: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  if (!/^\d+(\.\d+)?$/.test(human)) {
    throw new Error(`Invalid amount "${human}": expected a non-negative decimal string`);
  }

  const [intPart, fracPart = ''] = human.split('.');
  if (fracPart.length > decimals) {
    throw new Error(
      `Amount "${human}" has ${fracPart.length} fractional digits, but the coin only supports ${decimals}`,
    );
  }

  const combined = intPart + fracPart.padEnd(decimals, '0');
  const normalized = combined.replace(/^0+(?=\d)/, '');
  return normalized;
}

/**
 * Render an integer base-unit string as a human decimal — the inverse of
 * {@link toBaseUnits}. Exact string arithmetic, no `Number` anywhere: a
 * balance of 10^20 base units on an 18-decimal coin exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * Trailing fractional zeros are trimmed, so 1500000/6 renders as "1.5" and
 * 1000000/6 as "1".
 *
 * @param base - Non-negative integer string, e.g. "1500000".
 * @param decimals - Number of base-unit decimal places for the coin.
 * @throws if `base` isn't a non-negative integer string.
 */
export function fromBaseUnits(base: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  if (!/^\d+$/.test(base)) {
    throw new Error(`Invalid base-unit amount "${base}": expected a non-negative integer string`);
  }
  if (decimals === 0) return base.replace(/^0+(?=\d)/, '');

  const padded = base.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, '');
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/** Resolved coin identity: canonical hex coinId + its decimal places. */
export interface ResolvedCoin {
  coinId: string;
  decimals: number;
}

/**
 * Resolve a coin symbol or hex coinId to `{ coinId, decimals }` via the
 * SDK's `TokenRegistry` singleton.
 *
 * @param symbolOrId - Either a 64-hex coinId (case-insensitive) or a symbol
 *   like "UCT". A hex coinId is returned unchanged (not re-cased).
 * @throws if the input looks like a coinId but isn't in the registry, or if
 *   the symbol has no known coinId/definition in the registry.
 */
export function resolveCoin(symbolOrId: string): ResolvedCoin {
  const registry = TokenRegistry.getInstance();

  if (HEX_COIN_ID_RE.test(symbolOrId)) {
    const def = registry.getDefinition(symbolOrId);
    if (!def) {
      throw new Error(`Unknown coinId "${symbolOrId}": not found in the token registry`);
    }
    return { coinId: symbolOrId, decimals: def.decimals ?? 0 };
  }

  const coinId = registry.getCoinIdBySymbol(symbolOrId);
  const def = registry.getDefinitionBySymbol(symbolOrId);
  if (!coinId || !def) {
    throw new Error(`Unknown coin symbol "${symbolOrId}": not found in the token registry`);
  }
  return { coinId, decimals: def.decimals ?? 0 };
}
