import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenRegistry } from '@unicitylabs/sphere-sdk';
import { fromBaseUnits, resolveCoin, toBaseUnits } from './coins';

describe('fromBaseUnits', () => {
  it('renders a fractional amount and trims trailing zeros', () => {
    expect(fromBaseUnits('1500000', 6)).toBe('1.5');
    expect(fromBaseUnits('1000000', 6)).toBe('1');
  });

  it('renders an amount smaller than one whole unit', () => {
    expect(fromBaseUnits('1', 18)).toBe('0.000000000000000001');
    expect(fromBaseUnits('0', 6)).toBe('0');
  });

  it('is exact past Number.MAX_SAFE_INTEGER', () => {
    expect(fromBaseUnits('105000000000000000000', 18)).toBe('105');
  });

  it('passes through when the coin has no decimals', () => {
    expect(fromBaseUnits('100', 0)).toBe('100');
  });

  it('round-trips with toBaseUnits', () => {
    for (const [human, decimals] of [['1.5', 6], ['0.000000000000000001', 18], ['100', 0]] as const) {
      expect(fromBaseUnits(toBaseUnits(human, decimals), decimals)).toBe(human);
    }
  });

  it('rejects a non-integer input', () => {
    expect(() => fromBaseUnits('1.5', 6)).toThrow();
  });
});

describe('toBaseUnits', () => {
  it('converts a fractional human amount to base units', () => {
    expect(toBaseUnits('1.5', 6)).toBe('1500000');
  });

  it('converts a whole number with 0 decimals', () => {
    expect(toBaseUnits('100', 0)).toBe('100');
  });

  it('rejects a fractional part longer than decimals', () => {
    expect(() => toBaseUnits('1.1234567', 6)).toThrow();
  });

  it('is exact for high-decimal tokens (no float rounding)', () => {
    // 1e-18 as a float would round to 0 / lose precision; string math must not.
    expect(toBaseUnits('0.000000000000000001', 18)).toBe('1');
  });

  it('rejects a malformed amount', () => {
    expect(() => toBaseUnits('abc', 6)).toThrow();
    expect(() => toBaseUnits('-1', 6)).toThrow();
    expect(() => toBaseUnits('', 6)).toThrow();
  });
});

describe('resolveCoin', () => {
  const FAKE_COIN_ID = 'b'.repeat(64);
  let getInstanceSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    getInstanceSpy?.mockRestore();
    getInstanceSpy = undefined;
  });

  it('returns a 64-hex coinId unchanged, with looked-up decimals', () => {
    getInstanceSpy = vi.spyOn(TokenRegistry, 'getInstance').mockReturnValue({
      getDefinition: (id: string) => (id === FAKE_COIN_ID ? { decimals: 8 } : undefined),
    } as unknown as TokenRegistry);

    expect(resolveCoin(FAKE_COIN_ID)).toEqual({ coinId: FAKE_COIN_ID, decimals: 8 });
  });

  it('accepts an uppercase-hex coinId too (case-insensitive match)', () => {
    getInstanceSpy = vi.spyOn(TokenRegistry, 'getInstance').mockReturnValue({
      getDefinition: () => ({ decimals: 8 }),
    } as unknown as TokenRegistry);

    expect(resolveCoin(FAKE_COIN_ID.toUpperCase())).toEqual({
      coinId: FAKE_COIN_ID.toUpperCase(),
      decimals: 8,
    });
  });

  it('resolves a symbol to the registry hex id + decimals', () => {
    getInstanceSpy = vi.spyOn(TokenRegistry, 'getInstance').mockReturnValue({
      getCoinIdBySymbol: (symbol: string) => (symbol === 'UCT' ? FAKE_COIN_ID : undefined),
      getDefinitionBySymbol: (symbol: string) =>
        symbol === 'UCT' ? { decimals: 6, id: FAKE_COIN_ID, symbol: 'UCT' } : undefined,
    } as unknown as TokenRegistry);

    expect(resolveCoin('UCT')).toEqual({ coinId: FAKE_COIN_ID, decimals: 6 });
  });

  it('throws a clear error when the registry has no such symbol', () => {
    getInstanceSpy = vi.spyOn(TokenRegistry, 'getInstance').mockReturnValue({
      getCoinIdBySymbol: () => undefined,
      getDefinitionBySymbol: () => undefined,
    } as unknown as TokenRegistry);

    expect(() => resolveCoin('NOPE')).toThrow(/unknown coin/i);
  });

  it('throws a clear error when the registry has no such coinId', () => {
    getInstanceSpy = vi.spyOn(TokenRegistry, 'getInstance').mockReturnValue({
      getDefinition: () => undefined,
    } as unknown as TokenRegistry);

    expect(() => resolveCoin('c'.repeat(64))).toThrow(/unknown coin/i);
  });
});
