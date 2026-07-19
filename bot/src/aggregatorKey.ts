/**
 * Resolves the bot's aggregator (SGW) API key with a fallback chain, so the
 * bot doesn't hit the network to provision a new key on every boot:
 *
 *   1. explicit env override (`AGGREGATOR_API_KEY`) — highest priority, lets
 *      an operator pin a shared/paid key without touching disk.
 *   2. a previously provisioned key saved on disk (`aggregator-key.json`
 *      under `dataDir`) — reused across restarts.
 *   3. provision a fresh key via `provisionAggregatorKey` (Task 1's
 *      challenge->sign->verify SGW flow) and persist it for next time.
 *
 * `provisionAggregatorKey` is itself idempotent get-or-create by the wallet's
 * index-0 pubkey (see `provisionAggregatorKey.ts`), but resolving from disk
 * first still saves a network round-trip (and the SGW challenge/verify
 * exchange) on every boot.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sphere } from '@unicitylabs/sphere-sdk';
import { provisionAggregatorKey } from './provisionAggregatorKey';

export interface ResolveAggregatorKeyOptions {
  network: string;
  dataDir: string;
  envKey?: string;
  provision?: (sphere: Sphere, network: string) => Promise<{ apiKey: string; plan: string; created: boolean }>;
}

export interface ResolveAggregatorKeyResult {
  apiKey: string;
  source: 'env' | 'saved' | 'provisioned';
}

interface SavedAggregatorKeyFile {
  apiKey: string;
  plan?: string;
  provisionedAt?: string;
}

const FILE_NAME = 'aggregator-key.json';

function readSavedKey(filePath: string): string | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined; // missing (or unreadable) — fall through to provision
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedAggregatorKeyFile>;
    return typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0 ? parsed.apiKey : undefined;
  } catch {
    return undefined; // corrupt JSON — fall through to provision
  }
}

export async function resolveAggregatorKey(
  sphere: Sphere,
  opts: ResolveAggregatorKeyOptions,
): Promise<ResolveAggregatorKeyResult> {
  const envKey = opts.envKey?.trim();
  if (envKey) {
    return { apiKey: envKey, source: 'env' };
  }

  const filePath = path.join(opts.dataDir, FILE_NAME);
  const saved = readSavedKey(filePath);
  if (saved) {
    console.log(`[aggregatorKey] using saved key from ${filePath}`);
    return { apiKey: saved, source: 'saved' };
  }

  const provision = opts.provision ?? provisionAggregatorKey;
  const result = await provision(sphere, opts.network);

  fs.mkdirSync(opts.dataDir, { recursive: true });
  const toSave: SavedAggregatorKeyFile = {
    apiKey: result.apiKey,
    plan: result.plan,
    provisionedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2));
  console.log(`[aggregatorKey] provisioned a new key and saved it to ${filePath}`);

  return { apiKey: result.apiKey, source: 'provisioned' };
}
