/**
 * The banner renders a bag that came off the wire, so its size is not ours to assume.
 *
 * `data` is whatever the host attached before the answer was lost. It crosses postMessage from a
 * peer on an SDK version this dApp does not control, and the banner carries the ONLY way out of
 * the 4201 lock. A megabyte-long value or a hundred keys would push that button off the screen
 * and leave the form dead with no visible release.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutcomeUnknownBanner } from './OutcomeUnknownBanner';
import type { IntentFailure } from '../../lib/intentFailure';

function unknown(data: Record<string, unknown> | null, message = 'Intent outcome unknown'): IntentFailure {
  return { kind: 'outcome-unknown', message, data };
}

function renderBanner(failure: IntentFailure) {
  render(
    <OutcomeUnknownBanner failure={failure} action="send" reconcile="Check the recipient."
      onAcknowledge={vi.fn()} />,
  );
}

const acknowledge = () => screen.getByRole('button', { name: /I checked what happened/ });

describe('OutcomeUnknownBanner data bag', () => {
  it('shows a normal bag verbatim', () => {
    renderBanner(unknown({ transferId: 'abc123', attempt: 2 }));

    expect(screen.getByText('transferId')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('clamps an absurdly long value instead of rendering all of it', () => {
    renderBanner(unknown({ note: 'x'.repeat(50_000) }));

    expect(screen.queryByText('x'.repeat(50_000))).toBeNull();
    const rendered = screen.getByText(/^x+…/);
    expect(rendered.textContent!.length).toBeLessThan(300);
    // It says what was hidden rather than pretending the value was that short.
    expect(rendered.textContent).toContain('50000 chars');
    expect(acknowledge()).toBeTruthy();
  });

  it('caps the number of fields and says how many were left out', () => {
    const data = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    renderBanner(unknown(data));

    expect(screen.getByText('k0')).toBeTruthy();
    expect(screen.queryByText('k39')).toBeNull();
    expect(screen.getByText('32 more fields not shown')).toBeTruthy();
    expect(acknowledge()).toBeTruthy();
  });

  it('clamps the message too, and survives a value that will not serialise', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    renderBanner(unknown({ loop: circular }, 'y'.repeat(5_000)));

    expect(screen.getByText(/^y+…/).textContent!.length).toBeLessThan(300);
    expect(screen.getByText(/unserialisable object/)).toBeTruthy();
    expect(acknowledge()).toBeTruthy();
  });

  it('renders nothing for an ordinary refusal', () => {
    render(
      <OutcomeUnknownBanner failure={{ kind: 'error', message: 'User rejected' }} action="send"
        reconcile="Check the recipient." onAcknowledge={vi.fn()} />,
    );
    expect(screen.queryByText(/Outcome unknown/)).toBeNull();
  });
});
