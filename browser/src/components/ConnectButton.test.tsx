import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

const picker = () => screen.getByRole('combobox', { name: /network/i }) as HTMLSelectElement;

describe('ConnectButton — network', () => {
  it('puts the network selector next to the Connect button', () => {
    renderButton();

    expect(picker()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeTruthy();
    expect(picker().selectedOptions[0]?.textContent).toBe('testnet2 (4)');
  });

  it('hands the picked registry network up', () => {
    const { onNetworkChange } = renderButton();

    fireEvent.change(picker(), { target: { value: 'mainnet' } });

    expect(onNetworkChange).toHaveBeenCalledTimes(1);
    expect(onNetworkChange.mock.calls[0]?.[0]).toBe(TEST_REGISTRY.mainnet);
  });

  it('is open while nothing is connecting', () => {
    renderButton();

    expect(picker().disabled).toBe(false);
  });

  // A handshake in flight has already declared a network; changing the selector under it would
  // show one network while the wallet is being asked about another.
  it('locks the selector, and says so, while a connect attempt is in flight', () => {
    renderButton({ isConnecting: true });

    expect(picker().disabled).toBe(true);
    expect(screen.getByText(/connect attempt/i)).toBeTruthy();
  });

  it('shows the failure it was given — the network refusal reads as itself', () => {
    const message = 'This app targets testnet2 (4), but the wallet is on mainnet (1).';
    renderButton({ error: message });

    expect(screen.getByText(message)).toBeTruthy();
  });
});
