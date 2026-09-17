/**
 * The mint_nft panel: what it puts on the wire, and the three answers it must tell apart.
 *
 * The 4201 case is the one that matters. `INTENT_OUTCOME_UNKNOWN` means the wallet TOOK the mint
 * and the answer was lost, so the token may already exist — re-enabling the button there is how a
 * user ends up with two. The host may have attached the `tokenId` it was about to return, and
 * showing it turns the reconciliation into one lookup.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectError, ERROR_CODES, INTENT_ACTIONS, nftContentFromWire } from '@unicitylabs/sphere-sdk/connect';
import { MintNftPanel } from './MintNftPanel';

const TOKEN_ID = 'cd'.repeat(32);

function renderPanel(answer: { resolve?: unknown; reject?: unknown }) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  const intent = <T,>(action: string, params: Record<string, unknown>): Promise<T> => {
    calls.push({ action, params });
    return answer.reject !== undefined
      ? Promise.reject(answer.reject)
      : Promise.resolve(answer.resolve as T);
  };
  render(<MintNftPanel intent={intent} />);
  return { calls };
}

const mintButton = () =>
  screen.getByRole('button', { name: /^Mint NFT( \(locked)?/ }) as HTMLButtonElement;

async function mintOnce(calls: unknown[]) {
  fireEvent.click(mintButton());
  await waitFor(() => expect(calls).toHaveLength(1));
}

describe('MintNftPanel', () => {
  it('sends mint_nft with content the wallet can decode', async () => {
    const { calls } = renderPanel({ resolve: { tokenId: TOKEN_ID } });
    await mintOnce(calls);

    expect(calls[0]?.action).toBe(INTENT_ACTIONS.MINT_NFT);
    // The round trip a real wallet performs before it shows an approval screen. If the panel
    // hand-rolled the JSON instead of using nftContentToWire, this is where it would break.
    const decoded = nftContentFromWire(calls[0]?.params.content);
    expect(decoded.kind).toBe('metadata');
    expect(decoded).toMatchObject({ name: 'Connect Example NFT' });

    expect(await screen.findByText('Minted')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(TOKEN_ID)).length).toBeGreaterThan(0);
  });

  it('keeps Mint disabled on 4201 and names the tokenId the wallet reported', async () => {
    const { calls } = renderPanel({
      reject: new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN, {
        tokenId: TOKEN_ID,
      }),
    });
    await mintOnce(calls);

    await waitFor(() => expect(mintButton().disabled).toBe(true));
    expect(screen.getByText(/^Outcome unknown/)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(TOKEN_ID)).length).toBeGreaterThan(0);

    // A second submit must issue no second mint — a second mint is a second token.
    fireEvent.click(mintButton());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
  });

  it('still locks on a 4201 that carries no tokenId', async () => {
    const { calls } = renderPanel({
      reject: new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN),
    });
    await mintOnce(calls);

    await waitFor(() => expect(mintButton().disabled).toBe(true));
    expect(screen.getByText(/^Outcome unknown/)).toBeTruthy();
  });

  // -32601 is what the Sphere wallet answers for send_nft today, and any wallet older than
  // Connect 2.3 answers it for mint_nft. Nothing happened, so the form stays usable.
  it('reports an unimplemented intent as a capability gap, not a failed mint', async () => {
    const { calls } = renderPanel({
      reject: new ConnectError('Unknown intent: mint_nft', ERROR_CODES.METHOD_NOT_FOUND),
    });
    await mintOnce(calls);

    expect(await screen.findByText(/does not implement mint_nft/)).toBeTruthy();
    await waitFor(() => expect(mintButton().disabled).toBe(false));
  });

  it('shows an ordinary refusal as an error and lets the user try again', async () => {
    const { calls } = renderPanel({
      reject: new ConnectError('User rejected', ERROR_CODES.USER_REJECTED),
    });
    await mintOnce(calls);

    expect(await screen.findByText('User rejected')).toBeTruthy();
    expect(screen.queryByText(/Outcome unknown/)).toBeNull();
    await waitFor(() => expect(mintButton().disabled).toBe(false));
  });
});
