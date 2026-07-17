/**
 * Pure coin/amount helpers for the own-wallet bot example.
 *
 * - `toBaseUnits` converts a human-readable decimal amount (e.g. "1.5") into
 *   the integer base-unit string the SDK's `payments.send` / `mintFungibleToken`
 *   expect. It is string-based and exact — never routes through `Number`/
 *   `parseFloat`, which lose precision for high-decimal (e.g. 18-decimal) tokens.
 * - `resolveCoin` accepts either a 64-hex coinId or a symbol (e.g. "UCT") and
 *   resolves it to `{ coinId, decimals }` via the SDK's `TokenRegistry` singleton.
 *
 * TokenRegistry methods used here are verified against
 * `sphere-sdk/registry/TokenRegistry.ts` (0.11.14 source):
 *   - `TokenRegistry.getInstance()`               — TokenRegistry.ts:128
 *   - `getDefinition(coinId): TokenDefinition | undefined`      — TokenRegistry.ts:460
 *   - `getDefinitionBySymbol(symbol): TokenDefinition | undefined` — TokenRegistry.ts:470
 *   - `getCoinIdBySymbol(symbol): string | undefined`           — TokenRegistry.ts:581
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
