import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import { WalletHeader } from './WalletHeader';

const identity: PublicIdentity = {
  chainPubkey: '02aaaa000000000000000000000000000000000000000000000000000000000000',
  directAddress: 'DIRECT://aaaa000000000000000000000000000000000000000000000000000000000000',
  nametag: 'alice',
};

describe('WalletHeader', () => {
  it('says Connected while the wallet is usable', () => {
    render(<WalletHeader identity={identity} onDisconnect={() => {}} isWalletLocked={false} />);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByText('Locked')).toBeNull();
  });

  // The badge was hardcoded green "Connected"; under a session-preserving lock that is a lie
  // the user acts on — every panel errors while the header insists everything is fine.
  it('says Locked instead of Connected while the wallet is locked', () => {
    render(<WalletHeader identity={identity} onDisconnect={() => {}} isWalletLocked />);
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.queryByText('Connected')).toBeNull();
  });
});
