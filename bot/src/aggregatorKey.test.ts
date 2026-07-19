import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAggregatorKey } from './aggregatorKey';

// Fake sphere — resolution never touches it directly; it's only handed to
// the (stubbed) provision function.
const fakeSphere = {} as any;

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aggregator-key-test-'));
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function makeStubProvision() {
  let calls = 0;
  const provision = async () => {
    calls += 1;
    return { apiKey: 'sk_new', plan: 'free', created: true };
  };
  return { provision, callCount: () => calls };
}

describe('resolveAggregatorKey', () => {
  it('uses the env key when present, without touching files or provisioning', async () => {
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      envKey: 'sk_env',
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_env', source: 'env' });
    expect(callCount()).toBe(0);
    expect(fs.existsSync(path.join(dataDir, 'aggregator-key.json'))).toBe(false);
  });

  it('treats a whitespace-only env key as unset and falls through', async () => {
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      envKey: '   ',
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_new', source: 'provisioned' });
    expect(callCount()).toBe(1);
  });

  it('reuses a previously saved key without calling provision', async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'aggregator-key.json'), JSON.stringify({ apiKey: 'sk_saved' }));
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_saved', source: 'saved' });
    expect(callCount()).toBe(0);
  });

  it('provisions and persists when there is no env key and no saved file, then reuses it on a second call', async () => {
    const { provision, callCount } = makeStubProvision();

    const first = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      provision,
    });

    expect(first).toEqual({ apiKey: 'sk_new', source: 'provisioned' });
    expect(callCount()).toBe(1);

    const filePath = path.join(dataDir, 'aggregator-key.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.apiKey).toBe('sk_new');

    const second = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      provision,
    });

    expect(second).toEqual({ apiKey: 'sk_new', source: 'saved' });
    expect(callCount()).toBe(1); // not called again
  });

  it('falls through to provisioning when the saved file is missing', async () => {
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir: path.join(dataDir, 'does-not-exist-yet'),
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_new', source: 'provisioned' });
    expect(callCount()).toBe(1);
  });

  it('falls through to provisioning when the saved file is corrupt JSON', async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'aggregator-key.json'), '{ not valid json');
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_new', source: 'provisioned' });
    expect(callCount()).toBe(1);
  });

  it('falls through to provisioning when the saved file has an empty apiKey', async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'aggregator-key.json'), JSON.stringify({ apiKey: '' }));
    const { provision, callCount } = makeStubProvision();

    const result = await resolveAggregatorKey(fakeSphere, {
      network: 'testnet2',
      dataDir,
      provision,
    });

    expect(result).toEqual({ apiKey: 'sk_new', source: 'provisioned' });
    expect(callCount()).toBe(1);
  });
});
