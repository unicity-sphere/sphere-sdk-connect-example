/**
 * Guards the test environment itself.
 *
 * Every test this branch adds depends on three things being true: jsdom is the
 * environment, React Testing Library can mount a component, and the shared
 * @unicitylabs/sphere-ui components survive that mount (Task 7's WalletStatusBanner
 * renders AlertBanner). When one of them breaks it must break HERE — not inside a
 * hook test, where it would look like a product bug.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@unicitylabs/sphere-ui';

describe('test environment', () => {
  it('runs in jsdom, not node', () => {
    expect(typeof document).toBe('object');
    expect(document.body).toBeTruthy();
    expect(typeof window.sessionStorage.setItem).toBe('function');
  });

  it('mounts a sphere-ui component through React Testing Library', () => {
    render(<Button>Unlock</Button>);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy();
  });
});
