import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TEST_REGISTRY } from '../test/networkRegistry';
import { NetworkPicker } from './NetworkPicker';

// The registry is swapped for a table that includes an invented network, so the options below can
// only come from SPHERE_NETWORKS itself — see src/test/networkRegistry.ts.
vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { TEST_REGISTRY } = await import('../test/networkRegistry');
  return { ...actual, SPHERE_NETWORKS: TEST_REGISTRY };
});

const group = () => screen.getByRole('group', { name: 'Network' });

/** The control itself. It is the only button inside the group; the list is portalled elsewhere. */
const trigger = () => within(group()).getByRole('button');

/**
 * The rows of the open list.
 *
 * Scoped to the portal, not to "every button outside the group": CustomSelect appends its
 * dropdown to `document.body` after Testing Library's own container, so while it is open it is
 * the last child — and a caller's other buttons (ConnectButton has one right beside the picker)
 * would otherwise be counted as rows.
 */
const listRows = () =>
  within(document.body.lastElementChild as HTMLElement).queryAllByRole('button');

const openList = () => {
  fireEvent.click(trigger());
  return listRows();
};

describe('NetworkPicker', () => {
  it('offers one row per registry network, labelled from the registry', () => {
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={() => {}} />);

    expect(openList().map((row) => row.textContent)).toEqual([
      'mainnet',
      'testnet2',
      'stagenet',
    ]);
  });

  it('shows the network it was given as the selection', () => {
    render(<NetworkPicker value={TEST_REGISTRY.mainnet} onChange={() => {}} />);

    expect(trigger().textContent).toBe('mainnet');
  });

  it('reports the registry entry the user picked, not a copy or a name', () => {
    const onChange = vi.fn();
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={onChange} />);

    const stagenet = openList().find((row) => row.textContent === 'stagenet');
    fireEvent.click(stagenet!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe(TEST_REGISTRY.stagenet);
  });

  it('explains what the choice does while it is open', () => {
    render(<NetworkPicker value={TEST_REGISTRY.testnet2} onChange={() => {}} />);

    expect(group().getAttribute('aria-describedby')).toBe(
      screen.getByText(/declares in the handshake/i).id,
    );
  });

  // The control never goes dead without saying why: the reason is what replaces it, and the
  // reason is what the user reads. A readout rather than a disabled control, because the list
  // component takes no `disabled` and a trigger that looks live but ignores clicks is worse.
  it('is a plain readout and says why when it is locked', () => {
    render(
      <NetworkPicker
        value={TEST_REGISTRY.testnet2}
        onChange={() => {}}
        lockedReason="Disconnect to switch network."
      />,
    );

    expect(within(group()).queryByRole('button')).toBeNull();
    expect(within(group()).getByText('testnet2')).toBeTruthy();
    expect(group().getAttribute('aria-describedby')).toBe(
      screen.getByText('Disconnect to switch network.').id,
    );
  });

  // A wallet answers with an id only. If that id is one the registry lacks there is nothing to
  // pick it from, so the picker reads it out instead of feeding it to the chooser — where it
  // would land in the "nothing selected yet" grey, saying the opposite of what is true.
  it('reads out a network the registry does not contain, with no control to pick from', () => {
    render(<NetworkPicker value={{ id: 99 }} onChange={() => {}} />);

    expect(within(group()).queryByRole('button')).toBeNull();
    expect(within(group()).getByText('network 99')).toBeTruthy();
  });

  // Which row is the current one is the only thing the closed control cannot say, and every
  // assertion above passes whatever `value` is — the trigger shows the same label either way.
  it('marks the current network in the list, and only it', () => {
    render(<NetworkPicker value={TEST_REGISTRY.stagenet} onChange={() => {}} />);

    const marked = openList().filter((row) => (row.getAttribute('style') ?? '').includes('accent'));
    expect(marked.map((row) => row.textContent)).toEqual(['stagenet']);
  });

  // Compact drops the explanation to screen-reader-only, so hover is the only place it stays
  // readable — and the header, the one place compact ships, is always locked.
  it('keeps the explanation reachable on hover when it is compact', () => {
    render(
      <NetworkPicker
        compact
        value={TEST_REGISTRY.mainnet}
        lockedReason="Disconnect to switch network."
      />,
    );

    expect(group().getAttribute('title')).toBe('Disconnect to switch network.');
    expect(within(group()).getByText('mainnet')).toBeTruthy();
  });
});
