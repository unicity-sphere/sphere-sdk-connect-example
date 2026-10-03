import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';
import { TEST_REGISTRY } from '../../test/networkRegistry';
import { WalletHeader } from './WalletHeader';

vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { TEST_REGISTRY } = await import('../../test/networkRegistry');
  return { ...actual, SPHERE_NETWORKS: TEST_REGISTRY };
});

const identity: PublicIdentity = {
  chainPubkey: '02aaaa000000000000000000000000000000000000000000000000000000000000',
  directAddress: 'DIRECT://aaaa000000000000000000000000000000000000000000000000000000000000',
  nametag: 'alice',
};

const network = TEST_REGISTRY.testnet2;

describe('WalletHeader', () => {
  it('says Connected while the wallet is usable', () => {
    render(<WalletHeader identity={identity} network={network} onDisconnect={() => {}} isWalletLocked={false} />);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByText('Locked')).toBeNull();
  });

  // The badge was hardcoded green "Connected"; under a session-preserving lock that is a lie
  // the user acts on — every panel errors while the header insists everything is fine.
  it('says Locked instead of Connected while the wallet is locked', () => {
    render(<WalletHeader identity={identity} network={network} onDisconnect={() => {}} isWalletLocked />);
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('shows the network the session is on', () => {
    render(<WalletHeader identity={identity} network={TEST_REGISTRY.mainnet} onDisconnect={() => {}} isWalletLocked={false} />);

    const group = screen.getByRole('group', { name: 'Network' });
    expect(within(group).getByText('mainnet')).toBeTruthy();
  });

  // A session is bound to the network declared in its handshake. The header offers no way to
  // change it — the network is there so the user can SEE it, as a readout rather than a control,
  // so it cannot be mistaken for a setting of the live session.
  it('shows the network as a readout and tells the user to disconnect to change it', () => {
    render(<WalletHeader identity={identity} network={network} onDisconnect={() => {}} isWalletLocked={false} />);

    const group = screen.getByRole('group', { name: 'Network' });
    expect(within(group).queryByRole('button')).toBeNull();
    expect(screen.getByText(/disconnect to switch/i)).toBeTruthy();
  });
});
