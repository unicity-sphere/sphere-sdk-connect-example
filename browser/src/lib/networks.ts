/**
 * Which network this dApp declares in the Connect handshake, and where that choice comes from.
 *
 * The handshake carries the dApp's network and the wallet's compatibility gate compares it with
 * its own by `id`, refusing a mismatch with INCOMPATIBLE_NETWORK (4008) — a missing network
 * included. So the network is a real input, not a constant to bury: a bundle that can only ever
 * mean one chain is how a build ships pointed at the wrong one.
 *
 * Every network named here comes out of the SDK's `SPHERE_NETWORKS`. No list of names is written
 * down in this file, so a network the SDK adds shows up in the picker with no change here.
 */
import { SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import type { NetworkInfo } from '@unicitylabs/sphere-sdk/connect';

/** localStorage key for the network the user picked. Holds a registry key, e.g. `mainnet`. */
export const NETWORK_STORAGE_KEY = 'sphere-connect-network';

/**
 * The registry as a plain string-keyed table. `SPHERE_NETWORKS` is typed by its literal keys,
 * which is right for `SPHERE_NETWORKS.testnet2` and useless for a name that arrives at runtime.
 */
const REGISTRY: Readonly<Record<string, NetworkInfo>> = SPHERE_NETWORKS;

/**
 * The entry registered under `name`, or undefined.
 *
 * `REGISTRY[name]` alone is not a lookup: it answers for everything on Object.prototype too, so
 * `constructor` would come back as the Object function — truthy, therefore "found" — and be
 * handed to ConnectClient as a network.
 */
function registryEntry(name: string): NetworkInfo | undefined {
  return Object.hasOwn(REGISTRY, name) ? REGISTRY[name] : undefined;
}

/** The registry key of `network`, matched by `id` — the canonical key the wallet compares. */
function registryKey(network: NetworkInfo): string | undefined {
  return Object.keys(REGISTRY).find((key) => REGISTRY[key]?.id === network.id);
}

/** `mainnet (1)`, `network 4`, or null when the peer sent no usable descriptor. */
export function formatNetwork(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name } = value as { id?: unknown; name?: unknown };
  if (typeof id !== 'number') return null;
  // A host answers `network: { id }` and nothing more — the id is the key, the name is metadata.
  // Fill a missing name from the registry so "the wallet is on network 1" can say mainnet.
  const label =
    (typeof name === 'string' && name.length > 0 ? name : null) ??
    Object.values(REGISTRY).find((n) => n.id === id)?.name;
  return label ? `${label} (${id})` : `network ${id}`;
}

export interface NetworkOption {
  /** The registry key: what the user's choice is stored as, and the <option> value. */
  readonly key: string;
  /** The registry entry itself — exactly what ConnectClient's `network` option takes. */
  readonly network: NetworkInfo;
  readonly label: string;
}

/** Every network the SDK knows, in registry order. */
export function networkOptions(): NetworkOption[] {
  return Object.entries(REGISTRY).map(([key, network]) => ({
    key,
    network,
    label: formatNetwork(network) ?? key,
  }));
}

/**
 * The network a build targets by default, from `VITE_SPHERE_NETWORK`: any key of the registry.
 * Unset means testnet2.
 *
 * An unknown value falls back to testnet2 with a console warning rather than throwing — a typo
 * in an env file must not turn into a blank page.
 */
export function envNetwork(name: string | undefined): NetworkInfo {
  if (!name) return SPHERE_NETWORKS.testnet2;
  const network = registryEntry(name);
  if (network) return network;
  console.warn(
    `[connect] Unknown VITE_SPHERE_NETWORK "${name}" — known: ${Object.keys(REGISTRY).join(', ')}. Falling back to testnet2.`,
  );
  return SPHERE_NETWORKS.testnet2;
}

/**
 * The network the user picked on an earlier visit, or null.
 *
 * localStorage is the user's to edit and other versions of this page's to write, so a value that
 * is not a registry key reads as "no choice", never as a network. The accessor itself can throw
 * (private windows, blocked site data), which reads the same way.
 */
export function readStoredNetwork(): NetworkInfo | null {
  try {
    const key = localStorage.getItem(NETWORK_STORAGE_KEY);
    return key === null ? null : (registryEntry(key) ?? null);
  } catch {
    return null;
  }
}

/** Remember the user's pick. A network outside the registry, or storage that throws, is ignored. */
export function storeNetwork(network: NetworkInfo): void {
  const key = registryKey(network);
  if (!key) return;
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, key);
  } catch {
    // The picker still works; it just cannot remember.
  }
}
