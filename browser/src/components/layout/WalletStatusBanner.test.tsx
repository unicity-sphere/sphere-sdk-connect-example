import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletStatusBanner } from './WalletStatusBanner';

describe('WalletStatusBanner', () => {
  it('renders nothing while a 2.1 wallet is healthy', () => {
    const { container } = render(
      <WalletStatusBanner isWalletLocked={false} walletChanged={false} walletProtocol="2.1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('explains that a locked wallet is still connected', () => {
    render(<WalletStatusBanner isWalletLocked walletChanged={false} walletProtocol="2.1" />);
    expect(screen.getByText('Wallet locked')).toBeTruthy();
    expect(screen.getByText(/WALLET_LOCKED \(4009\)/)).toBeTruthy();
    expect(screen.queryByText('Wallet changed')).toBeNull();
  });

  it('warns when a different wallet came back from the lock', () => {
    render(<WalletStatusBanner isWalletLocked={false} walletChanged walletProtocol="2.1" />);
    expect(screen.getByText('Wallet changed')).toBeTruthy();
    expect(screen.queryByText('Wallet locked')).toBeNull();
  });

  it('warns that locking a Connect 2.0 wallet ends the session', () => {
    render(<WalletStatusBanner isWalletLocked={false} walletChanged={false} walletProtocol="2.0" />);
    expect(screen.getByText('Legacy wallet')).toBeTruthy();
  });
});

describe('WalletStatusBanner — raising the wallet window', () => {
  it('offers to raise the wallet window only when the caller can do it', () => {
    const onFocusWallet = vi.fn(() => true);
    render(
      <WalletStatusBanner
        isWalletLocked
        walletChanged={false}
        walletProtocol="2.1"
        onFocusWallet={onFocusWallet}
      />,
    );

    // A BUTTON, never an automatic focus grab: the wallet stays the only thing that decides
    // when a password field appears.
    expect(onFocusWallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('focus-wallet'));
    expect(onFocusWallet).toHaveBeenCalledTimes(1);
  });

  it('does not offer it when there is no window to raise', () => {
    render(<WalletStatusBanner isWalletLocked walletChanged={false} walletProtocol="2.1" />);
    expect(screen.queryByTestId('focus-wallet')).toBeNull();
  });
});
