/**
 * The 4201 double-pay guard, end to end through the panel that can lose money.
 *
 * INTENT_OUTCOME_UNKNOWN means the wallet TOOK the send and the answer was lost. The panel used
 * to catch every rejection the same way — `setError(err.message)`, button re-enabled — which
 * invites the user to press Send a second time. A second send consumes a different source token
 * and pays twice.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectError, ERROR_CODES, INTENT_ACTIONS, RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { SendPanel } from './SendPanel';

const ASSET = {
  coinId: 'ffaa',
  symbol: 'UCT',
  name: 'Unicity Coin',
  decimals: 0,
  totalAmount: '1000',
};

/** Resolves the asset list CoinSelect loads (it auto-selects the first coin), nothing else. */
const query = <T,>(method: string): Promise<T> =>
  Promise.resolve((method === RPC_METHODS.GET_ASSETS ? [ASSET] : null) as T);

function renderPanel(rejectWith: unknown) {
  const sends: Record<string, unknown>[] = [];
  const intent = <T,>(action: string, params: Record<string, unknown>): Promise<T> => {
    if (action === INTENT_ACTIONS.SEND) sends.push(params);
    return Promise.reject(rejectWith);
  };
  render(<SendPanel intent={intent} query={query} />);
  return { sends };
}

/** Fill the form and press Send once. Resolves after the rejection has been rendered. */
async function sendOnce(sends: unknown[]) {
  fireEvent.change(await screen.findByPlaceholderText(/Recipient/), { target: { value: '@bob' } });
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '5' } });
  const button = screen.getByRole('button', { name: /^Send$/ });
  fireEvent.click(button);
  await waitFor(() => expect(sends).toHaveLength(1));
}

const sendButton = () =>
  screen.getByRole('button', { name: /^Send( \(locked)?/ }) as HTMLButtonElement;

describe('SendPanel on INTENT_OUTCOME_UNKNOWN (4201)', () => {
  const lostAnswer = () =>
    new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN, {
      action: 'send',
    });

  it('keeps Send disabled and shows a reconcile state instead of an error', async () => {
    const { sends } = renderPanel(lostAnswer());
    await sendOnce(sends);

    await waitFor(() => expect(sendButton().disabled).toBe(true));
    expect(screen.getByText(/Outcome unknown/)).toBeTruthy();
    expect(screen.getByText(/Do NOT retry blindly/)).toBeTruthy();
  });

  it('cannot be sent again while the outcome is unknown', async () => {
    const { sends } = renderPanel(lostAnswer());
    await sendOnce(sends);
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    // Belt and braces: clicking a disabled button is a no-op in a browser, but execute() itself
    // must refuse too — a keyboard submit or a stale render must not slip past the guard.
    fireEvent.click(sendButton());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sends).toHaveLength(1);
  });

  it('releases the form only when the user says they reconciled it', async () => {
    const { sends } = renderPanel(lostAnswer());
    await sendOnce(sends);
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /I checked what happened/ }));

    await waitFor(() => expect(sendButton().disabled).toBe(false));
    expect(screen.queryByText(/Outcome unknown/)).toBeNull();
  });
});

describe('SendPanel on an ordinary refusal', () => {
  it('still shows the error and lets the user try again', async () => {
    const { sends } = renderPanel(new ConnectError('User rejected', ERROR_CODES.USER_REJECTED));
    await sendOnce(sends);

    expect(await screen.findByText('User rejected')).toBeTruthy();
    expect(screen.queryByText(/Outcome unknown/)).toBeNull();
    await waitFor(() => expect(sendButton().disabled).toBe(false));

    fireEvent.click(sendButton());
    await waitFor(() => expect(sends).toHaveLength(2));
  });
});
