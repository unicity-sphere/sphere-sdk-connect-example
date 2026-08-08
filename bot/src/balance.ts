/**
 * Balance rendering, extracted from `index.ts` so it can be unit-tested.
 *
 * `index.ts` calls `main()` at module scope — importing it from a test boots a real
 * wallet — so anything worth asserting on has to live outside it. That is why
 * `coins.ts`, `sendSafety.ts` and `aggregatorKey.ts` are separate modules, and this
 * is the same rule applied to the one piece of money formatting the bot does.
 *
 * Verified against `@unicitylabs/sphere-sdk` **0.14.2**: `Asset` (types/index.ts)
 * carries `symbol: string`, `totalAmount: string` in BASE units, `decimals: number`
 * and `tokenCount: number`.
 */
import { type Asset } from '@unicitylabs/sphere-sdk';
import { fromBaseUnits } from './coins';

/**
 * `Asset.totalAmount` is in BASE units — `fromBaseUnits` puts the decimal point back.
 *
 * Falls back to the raw base-unit string when the decimal point cannot be placed.
 * `Asset.decimals` is typed as a required `number`, so in a well-behaved SDK this
 * never fires — but the value crosses a network boundary from wallet-api before it
 * is typed, and printing a balance must never be able to kill the bot.
 */
export function formatAssets(assets: Asset[]): string {
  if (assets.length === 0) return '(empty)';
  return assets
    .map((a) => {
      let amount: string;
      try {
        amount = fromBaseUnits(a.totalAmount, a.decimals);
      } catch {
        amount = `${a.totalAmount} (base units)`;
      }
      return `${amount} ${a.symbol} (${a.tokenCount} token(s))`;
    })
    .join('\n  ');
}
