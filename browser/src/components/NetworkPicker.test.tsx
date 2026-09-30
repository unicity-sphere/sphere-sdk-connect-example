import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TEST_REGISTRY } from '../test/networkRegistry';
import { NetworkPicker } from './NetworkPicker';

// The registry is swapped for a table that includes an invented network, so the options below can
// only come from SPHERE_NETWORKS itself — see src/test/networkRegistry.ts.
vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { TEST_REGISTRY } = await import('../test/networkRegistry');
  return { ...actual, SPHERE_NETWORKS: TEST_REGISTRY };
});

const picker = () => screen.getByRole('combobox', { name: /network/i }) as HTMLSelectElement;

describe('NetworkPicker', () => {
  it('offers one option per registry network, labelled from the registry', () => {
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={() => {}} />);

    const options = Array.from(picker().options).map((o) => o.textContent);
    expect(options).toEqual(['mainnet (1)', 'testnet2 (4)', 'stagenet (7)']);
  });

  it('shows the network it was given as the selection', () => {
    render(<NetworkPicker value={TEST_REGISTRY.mainnet} onChange={() => {}} />);

    expect(picker().selectedOptions[0]?.textContent).toBe('mainnet (1)');
  });

  it('reports the registry entry the user picked, not a copy or a name', () => {
    const onChange = vi.fn();
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={onChange} />);

    fireEvent.change(picker(), { target: { value: 'stagenet' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(TEST_REGISTRY.stagenet);
  });

  it('explains what the choice does while it is open', () => {
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={() => {}} />);

    expect(picker().disabled).toBe(false);
    expect(screen.getByText(/declares in the handshake/i)).toBeTruthy();
  });

  // The control never goes dead without saying why: the reason is what disables it, and the
  // reason is what the user reads.
  it('is disabled and says why when it is locked', () => {
    render(
      <NetworkPicker
        value={TEST_REGISTRY.testnet2}
        onChange={() => {}}
        lockedReason="Disconnect to switch network."
      />,
    );

    expect(picker().disabled).toBe(true);
    expect(screen.getByText('Disconnect to switch network.')).toBeTruthy();
    expect(picker().getAttribute('aria-describedby')).toBe(
      screen.getByText('Disconnect to switch network.').id,
    );
  });

  // A wallet answers with an id only. If that id is one the registry lacks, a <select> with no
  // matching option would silently show the first entry — a network the session is not on.
  it('shows a network the registry does not contain as itself, and keeps it unselectable', () => {
    render(<NetworkPicker value={{ id: 99 }} onChange={() => {}} lockedReason="Locked." />);

    expect(picker().selectedOptions[0]?.textContent).toBe('network 99');
    expect(Array.from(picker().options)).toHaveLength(4);
  });
});
