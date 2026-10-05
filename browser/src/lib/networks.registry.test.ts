/**
 * The picker against the registry the INSTALLED SDK really ships — no mocks.
 *
 * networks.test.ts proves the code reads the registry by feeding it an invented one. This file
 * pins the other half: that the real `SPHERE_NETWORKS` has the shape the code relies on, and that
 * the code agrees with it whichever SDK version is installed (0.14 lists testnet2 only, 0.16+
 * adds mainnet). Nothing here names `mainnet`, so it passes on both.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import type { NetworkInfo } from '@unicitylabs/sphere-sdk/connect';
import { envNetwork, networkOptions, readStoredNetwork, storeNetwork } from './networks';

const registry = SPHERE_NETWORKS as Record<string, NetworkInfo>;

beforeEach(() => {
  localStorage.clear();
});

describe('the installed SDK registry', () => {
  it('is a table of { id, name } entries, the NetworkInfo shape ConnectClient takes', () => {
    expect(Object.keys(registry).length).toBeGreaterThan(0);
    for (const entry of Object.values(registry)) {
      expect(typeof entry.id).toBe('number');
      expect(typeof entry.name).toBe('string');
    }
  });

  it('contains testnet2, the fallback', () => {
    expect(registry.testnet2).toBeDefined();
    expect(envNetwork(undefined)).toBe(registry.testnet2);
  });

  it('is what the picker lists, entry for entry', () => {
    const options = networkOptions();

    expect(options.map((o) => o.key)).toEqual(Object.keys(registry));
    expect(options.map((o) => o.network)).toEqual(Object.values(registry));
  });

  it('resolves every one of its keys as an env value and as a stored choice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const [key, entry] of Object.entries(registry)) {
      expect(envNetwork(key)).toBe(entry);
      storeNetwork(entry);
      expect(readStoredNetwork()).toBe(entry);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
