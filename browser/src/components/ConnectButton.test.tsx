import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TEST_REGISTRY } from '../test/networkRegistry';
import { ConnectButton } from './ConnectButton';

vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { TEST_REGISTRY } = await import('../test/networkRegistry');
  return { ...actual, SPHERE_NETWORKS: TEST_REGISTRY };
});

function renderButton(overrides: Partial<ComponentProps<typeof ConnectButton>> = {}) {
  const onNetworkChange = vi.fn();
  render(
    <ConnectButton
      onConnect={() => {}}
      onConnectExtension={() => {}}
      onConnectPopup={() => {}}
      isConnecting={false}
      extensionInstalled={false}
      error={null}
      network={TEST_REGISTRY.testnet2}
      onNetworkChange={onNetworkChange}
      {...overrides}
    />,
  );
  return { onNetworkChange };
}

const networkGroup = () => screen.getByRole('group', { name: 'Network' });

/** The control itself, while it is live: the only button inside the group. */
const picker = () => within(networkGroup()).getByRole('button');

/**
 * The rows of the open list.
 *
 * Scoped to the portal CustomSelect appends to `document.body` — while the list is open it is the
 * last child, after Testing Library's container. "Every button outside the group" would sweep in
 * "Connect Wallet", which sits right beside the picker, and call it a network.
 */
const listRows = () =>
  within(document.body.lastElementChild as HTMLElement).queryAllByRole('button');

describe('ConnectButton — network', () => {
  it('puts the network selector next to the Connect button', () => {
    renderButton();

    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeTruthy();
    expect(picker().textContent).toBe('testnet2');
  });

  it('hands the picked registry network up', () => {
    const { onNetworkChange } = renderButton();

    fireEvent.click(picker());
    fireEvent.click(listRows().find((row) => row.textContent === 'mainnet')!);

    expect(onNetworkChange).toHaveBeenCalledTimes(1);
    expect(onNetworkChange.mock.calls[0]?.[0]).toBe(TEST_REGISTRY.mainnet);
  });

  it('is open while nothing is connecting', () => {
    renderButton();

    fireEvent.click(picker());

    expect(listRows().map((row) => row.textContent)).toContain('mainnet');
  });

  // A handshake in flight has already declared a network; changing the selector under it would
  // show one network while the wallet is being asked about another. The control is replaced by a
  // readout rather than merely disabled, so there is nothing left to click.
  it('locks the selector, and says so, while a connect attempt is in flight', () => {
    renderButton({ isConnecting: true });

    expect(within(networkGroup()).queryByRole('button')).toBeNull();
    expect(within(networkGroup()).getByText('testnet2')).toBeTruthy();
    expect(screen.getByText(/connect attempt/i)).toBeTruthy();
  });

  it('shows the failure it was given — the network refusal reads as itself', () => {
    const message = 'This app targets testnet2, but the wallet is on mainnet.';
    renderButton({ error: message });

    expect(screen.getByText(message)).toBeTruthy();
  });
});
