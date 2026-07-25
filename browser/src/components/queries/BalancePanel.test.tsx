import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { BalancePanel } from './BalancePanel';

function makeQuery() {
  const calls: string[] = [];
  const query = <T,>(method: string): Promise<T> => {
    calls.push(method);
    const result =
      method === RPC_METHODS.GET_BALANCE
        ? [{ coinId: 'UCT', symbol: 'UCT', totalAmount: '500000000' }]
        : { fiatBalance: 12.5 };
    return Promise.resolve(result as T);
  };
  return { query, calls };
}

describe('BalancePanel', () => {
  it('does not fetch before any unlock has happened', () => {
    const { query, calls } = makeQuery();
    render(<BalancePanel query={query} unlockEpoch={0} />);
    expect(calls).toHaveLength(0);
  });

  // The reference retry-after-unlock: a READ is safe to re-issue automatically once the host
  // confirmed the SAME wallet came back. An intent is not, and never takes this prop.
  it('re-fetches when the same wallet is unlocked', async () => {
    const { query, calls } = makeQuery();
    const { rerender } = render(<BalancePanel query={query} unlockEpoch={0} />);

    rerender(<BalancePanel query={query} unlockEpoch={1} />);

    await waitFor(() => expect(calls).toContain(RPC_METHODS.GET_BALANCE));
    expect(calls).toContain(RPC_METHODS.GET_FIAT_BALANCE);
    expect(await screen.findByText('500000000')).toBeTruthy();
  });
});
