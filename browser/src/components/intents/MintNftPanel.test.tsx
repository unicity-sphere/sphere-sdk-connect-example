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

  // The 4201 lock has to have a way out, or Mint is dead until the component unmounts. Nothing
  // on this side can learn what the wallet did, so the release is an explicit button — never a
  // timer, and never the plain act of editing the form.
  it('releases the 4201 lock only when the user acknowledges it', async () => {
    const { calls } = renderPanel({
      reject: new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN),
    });
    await mintOnce(calls);
    await waitFor(() => expect(mintButton().disabled).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /I checked what happened/ }));

    await waitFor(() => expect(mintButton().disabled).toBe(false));
    expect(screen.queryByText(/^Outcome unknown/)).toBeNull();
    fireEvent.click(mintButton());
    await waitFor(() => expect(calls).toHaveLength(2));
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

/**
 * The optional image is an `NftLink`, and a link is pinned by the SHA-256 of the linked file.
 *
 * `nftContentToWire` / `nftContentFromWire` check shape and base64 only — `sha256: ''` survives
 * both — so a panel that shipped an empty digest would put content on the wire that the wallet
 * must refuse in `encodeNftContent`, and the refusal would read like the wallet's fault. The
 * panel judges the link itself, by the same rules, before it can be submitted.
 */
describe('MintNftPanel image link', () => {
  const uriInput = () => screen.getByPlaceholderText(/Image URI/) as HTMLInputElement;
  const digestInput = () => screen.getByPlaceholderText(/Image SHA-256/) as HTMLInputElement;

  it('will not submit a link without a digest', async () => {
    const { calls } = renderPanel({ resolve: { tokenId: TOKEN_ID } });

    fireEvent.change(uriInput(), { target: { value: 'https://example.com/a.png' } });

    await waitFor(() => expect(mintButton().disabled).toBe(true));
    expect(screen.getByText(/Image SHA-256 must be the 64-hex digest/)).toBeTruthy();
    // Even a click that gets past `disabled` must not reach the wallet.
    fireEvent.click(mintButton());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(0);
  });

  it('will not submit a link on a scheme the value rules reject', async () => {
    const { calls } = renderPanel({ resolve: { tokenId: TOKEN_ID } });

    fireEvent.change(uriInput(), { target: { value: 'http://example.com/a.png' } });
    fireEvent.change(digestInput(), { target: { value: 'ab'.repeat(32) } });

    await waitFor(() => expect(mintButton().disabled).toBe(true));
    expect(screen.getByText(/must start with https:\/\//)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('sends a complete link once the digest is there', async () => {
    const { calls } = renderPanel({ resolve: { tokenId: TOKEN_ID } });

    fireEvent.change(uriInput(), { target: { value: 'https://example.com/a.png' } });
    fireEvent.change(digestInput(), { target: { value: 'AB'.repeat(32) } });
    await waitFor(() => expect(mintButton().disabled).toBe(false));
    await mintOnce(calls);

    const decoded = nftContentFromWire(calls[0]?.params.content);
    expect(decoded).toMatchObject({
      image: {
        kind: 'link',
        media_type: 'image/png',
        uri: 'https://example.com/a.png',
        // Lowercased on the way out: the SDK decodes the digest as lowercase hex.
        sha256: 'ab'.repeat(32),
      },
    });
  });

  it('sends no image at all when the URI is left empty', async () => {
    const { calls } = renderPanel({ resolve: { tokenId: TOKEN_ID } });
    await mintOnce(calls);

    expect(nftContentFromWire(calls[0]?.params.content)).toMatchObject({ image: null });
  });
});
