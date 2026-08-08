import { describe, it, expect } from 'vitest';
import { type Asset } from '@unicitylabs/sphere-sdk';
import { formatAssets } from './balance';

const asset = (overrides: Partial<Asset>): Asset =>
  ({
    symbol: 'UCT',
    totalAmount: '100000000',
    decimals: 8,
    tokenCount: 1,
    ...overrides,
  }) as Asset;

describe('formatAssets', () => {
  it('renders an empty inventory as a placeholder, not an empty line', () => {
    expect(formatAssets([])).toBe('(empty)');
  });

  it('puts the decimal point back — the value arrives in BASE units', () => {
    expect(formatAssets([asset({ totalAmount: '150000000' })])).toBe('1.5 UCT (1 token(s))');
  });

  it('renders one line per asset', () => {
    const out = formatAssets([
      asset({ symbol: 'UCT', totalAmount: '100000000', tokenCount: 2 }),
      asset({ symbol: 'ALPHA', totalAmount: '250', decimals: 2, tokenCount: 1 }),
    ]);
    expect(out.split('\n  ')).toEqual(['1 UCT (2 token(s))', '2.5 ALPHA (1 token(s))']);
  });

  // `Asset.decimals` is a required `number` in the SDK types, but the value crosses a
  // network boundary from wallet-api before anything types it. A malformed one must
  // degrade to the raw base units, never throw the bot's print loop down.
  it.each([
    ['undefined decimals', { decimals: undefined as unknown as number }],
    ['negative decimals', { decimals: -1 }],
    ['fractional decimals', { decimals: 1.5 }],
    ['non-numeric amount', { totalAmount: 'not-a-number' }],
  ])('falls back to base units on %s instead of throwing', (_label, overrides) => {
    const out = formatAssets([asset(overrides)]);
    expect(out).toContain('(base units)');
    expect(out).toContain('UCT');
  });

  it('keeps rendering the good assets when one is malformed', () => {
    const out = formatAssets([
      asset({ symbol: 'BAD', decimals: -1 }),
      asset({ symbol: 'GOOD', totalAmount: '100000000' }),
    ]);
    expect(out).toContain('BAD');
    expect(out).toContain('1 GOOD (1 token(s))');
  });
});
