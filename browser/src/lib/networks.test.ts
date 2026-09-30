import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_REGISTRY } from '../test/networkRegistry';
import {
  NETWORK_STORAGE_KEY,
  envNetwork,
  formatNetwork,
  networkOptions,
  readStoredNetwork,
  storeNetwork,
} from './networks';

// The SDK's registry, swapped for a table with a network this app has never heard of. Every
// assertion below then holds only if the code reads SPHERE_NETWORKS — a hand-written
// `mainnet | testnet2` pair anywhere would drop `stagenet` and fail. (Against the registry the
// installed SDK really ships, see networks.registry.test.ts.)
vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { TEST_REGISTRY } = await import('../test/networkRegistry');
  return { ...actual, SPHERE_NETWORKS: TEST_REGISTRY };
});

beforeEach(() => {
  localStorage.clear();
});

describe('networkOptions', () => {
  it('lists every network in the registry, in registry order, as the registry objects themselves', () => {
    const options = networkOptions();

    expect(options.map((o) => o.key)).toEqual(['mainnet', 'testnet2', 'stagenet']);
    // Identity, not equality: what reaches ConnectClient is the SDK's own entry.
    for (const option of options) {
      expect(option.network).toBe((TEST_REGISTRY as Record<string, unknown>)[option.key]);
    }
  });

  it('labels an option from its registry entry — name and id', () => {
    expect(networkOptions().map((o) => o.label)).toEqual(['mainnet (1)', 'testnet2 (4)', 'stagenet (7)']);
  });
});

describe('envNetwork', () => {
  it('is testnet2 when the variable is unset or empty, without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(envNetwork(undefined)).toBe(TEST_REGISTRY.testnet2);
    expect(envNetwork('')).toBe(TEST_REGISTRY.testnet2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves a registry key to the registry entry', () => {
    expect(envNetwork('mainnet')).toBe(TEST_REGISTRY.mainnet);
    expect(envNetwork('stagenet')).toBe(TEST_REGISTRY.stagenet);
  });

  it('falls back to testnet2 with a warning that names the value and the known networks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(envNetwork('mainet')).toBe(TEST_REGISTRY.testnet2);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('VITE_SPHERE_NETWORK');
    expect(message).toContain('"mainet"');
    expect(message).toContain('mainnet, testnet2, stagenet');
    expect(message).toContain('testnet2');
  });

  // `registry[name]` answers for every member of Object.prototype too. `constructor` would come
  // back as the Object function — truthy, so "found" — and be handed to ConnectClient as a network.
  it('does not mistake an Object.prototype member for a network', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(envNetwork(name)).toBe(TEST_REGISTRY.testnet2);
    }
    expect(warn).toHaveBeenCalledTimes(4);
  });
});

describe('the stored choice', () => {
  it('reads nothing when nothing was stored', () => {
    expect(readStoredNetwork()).toBeNull();
  });

  it('round-trips through localStorage, stored as the registry key', () => {
    storeNetwork(TEST_REGISTRY.stagenet);

    expect(localStorage.getItem(NETWORK_STORAGE_KEY)).toBe('stagenet');
    expect(readStoredNetwork()).toBe(TEST_REGISTRY.stagenet);
  });

  // localStorage is the user's to edit and another version of this app's to write. A value that
  // is not a registry key must read as "no choice", never as a network.
  it('ignores a stored value that is not a registry key', () => {
    for (const junk of ['mainnet2', '', ' mainnet', 'constructor', '__proto__', '{"id":1}', '1']) {
      localStorage.setItem(NETWORK_STORAGE_KEY, junk);
      expect(readStoredNetwork()).toBeNull();
    }
  });

  it('does not store a network the registry does not contain', () => {
    storeNetwork({ id: 99, name: 'elsewhere' });

    expect(localStorage.getItem(NETWORK_STORAGE_KEY)).toBeNull();
  });

  // Private windows and blocked site data make the accessor throw. The picker must still work —
  // it just cannot remember.
  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(readStoredNetwork()).toBeNull();
    expect(() => storeNetwork(TEST_REGISTRY.mainnet)).not.toThrow();
  });
});

describe('formatNetwork', () => {
  it('shows name and id', () => {
    expect(formatNetwork({ id: 4, name: 'testnet2' })).toBe('testnet2 (4)');
  });

  // A host answers `network: { id }` and nothing else — the id is the canonical key, the name is
  // metadata. Naming it from the registry is what makes "the wallet is on mainnet" readable.
  it('names a network from the registry when the peer sent only the id', () => {
    expect(formatNetwork({ id: 1 })).toBe('mainnet (1)');
    expect(formatNetwork({ id: 7 })).toBe('stagenet (7)');
  });

  it('keeps the name the peer sent', () => {
    expect(formatNetwork({ id: 4, name: 'my-testnet' })).toBe('my-testnet (4)');
  });

  it('says "network <id>" for an id the registry does not know', () => {
    expect(formatNetwork({ id: 99 })).toBe('network 99');
  });

  it('returns null when the peer sent no usable descriptor', () => {
    expect(formatNetwork(null)).toBeNull();
    expect(formatNetwork(undefined)).toBeNull();
    expect(formatNetwork('mainnet')).toBeNull();
    expect(formatNetwork({ name: 'mainnet' })).toBeNull();
    expect(formatNetwork({ id: '1' })).toBeNull();
  });
});
