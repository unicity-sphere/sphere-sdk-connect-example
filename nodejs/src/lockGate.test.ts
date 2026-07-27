/**
 * Headless proof of the Connect 2.1 locked gate.
 *
 * Uses an in-process loopback transport — no ports, no timers, no flakes — so CI can assert
 * WALLET_LOCKED (4009) against the REAL ConnectHost and ConnectClient.
 *
 * This file is the cross-repo canary. It pins the CODE and the structured `data`, never the
 * refusal text: 'Wallet is locked' is a documented recommendation, not a wire contract, and a
 * dApp that discriminates on the message is the bug this feature exists to remove.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_PUSHED_EVENTS,
  ConnectClient,
  ConnectHost,
  ERROR_CODES,
  INTENT_ACTIONS,
  PERMISSION_SCOPES,
  RPC_METHODS,
  SPHERE_CONNECT_VERSION,
  SPHERE_NETWORKS,
  WALLET_EVENTS,
} from '@unicitylabs/sphere-sdk/connect';
import type {
  ConnectHostConfig,
  ConnectTransport,
  LockedRequestContext,
  PublicIdentity,
  SphereConnectMessage,
} from '@unicitylabs/sphere-sdk/connect';
import { mockSphere } from './mockSphere';

const ORIGIN = 'ws://localhost:8765';
const DAPP = { name: 'lock-gate test', description: 'headless 4009 check', url: 'cli://test' };

type Handler = (m: SphereConnectMessage) => void;

/**
 * One host endpoint, N client endpoints. The host broadcasts to every live client endpoint,
 * like a WS server with several peers; a client endpoint that is destroyed stops hearing.
 * Delivery is always out of band (queueMicrotask), never re-entrant inside send().
 */
function createLoopback() {
  const hostHandlers = new Set<Handler>();
  const clientSets = new Set<Set<Handler>>();

  const deliver = (targets: Iterable<Handler>, m: SphereConnectMessage) => {
    const snapshot = [...targets];
    queueMicrotask(() => {
      for (const handler of snapshot) handler(m);
    });
  };

  const host: ConnectTransport = {
    send: (m) => {
      const all: Handler[] = [];
      for (const set of clientSets) all.push(...set);
      deliver(all, m);
    },
    onMessage: (h) => {
      hostHandlers.add(h);
      return () => {
        hostHandlers.delete(h);
      };
    },
    destroy: () => {
      hostHandlers.clear();
    },
  };

  const newClient = (): ConnectTransport => {
    const mine = new Set<Handler>();
    clientSets.add(mine);
    return {
      send: (m) => deliver(hostHandlers, m),
      onMessage: (h) => {
        mine.add(h);
        return () => {
          mine.delete(h);
        };
      },
      destroy: () => {
        mine.clear();
        clientSets.delete(mine);
      },
    };
  };

  return { host, newClient };
}

/** Let the loopback microtask queue drain so pushed events have arrived. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function connectPair() {
  const loop = createLoopback();
  const lockedRequests: LockedRequestContext[] = [];

  const hostConfig: ConnectHostConfig = {
    sphere: mockSphere,
    transport: loop.host,
    origin: ORIGIN,
    onConnectionRequest: async () => ({
      approved: true,
      grantedPermissions: Object.values(PERMISSION_SCOPES),
    }),
    onIntent: async () => ({ result: { ok: true } }),
    // Notify-only. The host has ALREADY answered; this must never raise a credential surface.
    onLockedRequest: (ctx) => {
      lockedRequests.push(ctx);
    },
  };
  const host = new ConnectHost(hostConfig);

  const clientTransport = loop.newClient();
  const client = new ConnectClient({
    transport: clientTransport,
    dapp: DAPP,
    network: SPHERE_NETWORKS.testnet2,
    timeout: 2000,
  });

  const seen: { event: string; data: unknown }[] = [];
  for (const event of AUTO_PUSHED_EVENTS) {
    client.on(event, (data) => seen.push({ event, data }));
  }

  const result = await client.connect();
  return { loop, host, client, clientTransport, seen, lockedRequests, sessionId: result.sessionId, result };
}

describe('locked gate over a real ConnectHost', () => {
  it('serves queries while live', async () => {
    const { client, host, result } = await connectPair();
    const balance = await client.query(RPC_METHODS.GET_BALANCE);
    expect(Array.isArray(balance)).toBe(true);
    expect(host.walletState).toBe('live');
    expect(host.getState().session?.id).toBe(result.sessionId);
    expect(result.locked).not.toBe(true);
    expect(client.walletLocked).toBe(false);
  });

  it('answers WALLET_LOCKED with data.reason and keeps the session after setLocked()', async () => {
    const { client, host, seen, sessionId } = await connectPair();

    host.setLocked();
    await settle();

    expect(host.walletState).toBe('locked');
    expect(seen.map((s) => s.event)).toEqual([WALLET_EVENTS.LOCKED]);
    // The session survives a lock — that is the entire feature.
    expect(host.getSession()?.id).toBe(sessionId);
    expect(client.session).toBe(sessionId);
    expect(client.walletLocked).toBe(true);

    // CANARY: the code and the structured data are the contract. The message is NOT.
    await expect(client.query(RPC_METHODS.GET_BALANCE)).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_LOCKED,
      data: { reason: 'locked' },
    });
    // Balances, tokens and history are never served from a cache: a dApp with a stale balance
    // is a dApp about to collect an unpayable spend.
    for (const method of [
      RPC_METHODS.GET_ASSETS,
      RPC_METHODS.GET_TOKENS,
      RPC_METHODS.GET_HISTORY,
      RPC_METHODS.GET_FIAT_BALANCE,
    ]) {
      await expect(client.query(method)).rejects.toMatchObject({ code: ERROR_CODES.WALLET_LOCKED });
    }
  });

  it('serves the locked allow-list from the snapshot', async () => {
    const { client, host } = await connectPair();

    host.setLocked();
    await settle();

    // sphere_getIdentity: exactly the bytes this origin already received in the handshake
    // response. Never undefined-as-success, which would read as "the wallet has no identity".
    const identity = await client.query<PublicIdentity>(RPC_METHODS.GET_IDENTITY);
    expect(identity.chainPubkey).toBe(mockSphere.identity.chainPubkey);

    // sphere_subscribe MUST succeed while locked. ConnectClient.on() is fire-and-forget and
    // never retries, so refusing it would kill the dApp's event stream forever after one lock.
    await expect(
      client.query(RPC_METHODS.SUBSCRIBE, { event: 'transfer:incoming' }),
    ).resolves.toMatchObject({ subscribed: true, event: 'transfer:incoming' });

    await expect(
      client.query(RPC_METHODS.UNSUBSCRIBE, { event: 'transfer:incoming' }),
    ).resolves.toMatchObject({ unsubscribed: true, event: 'transfer:incoming' });
  });

  it('lets a locked dApp disconnect', async () => {
    const { client, host, seen } = await connectPair();

    host.setLocked();
    await settle();

    await expect(client.query(RPC_METHODS.DISCONNECT)).resolves.toMatchObject({ disconnected: true });
    await settle();

    expect(host.getSession()).toBeNull();
    expect(seen.map((s) => s.event)).toContain(WALLET_EVENTS.DISCONNECTED);
  });

  it('notifies onLockedRequest for a refused query and a refused intent, and not for a served one', async () => {
    const { client, host, lockedRequests } = await connectPair();

    host.setLocked();
    await settle();

    await expect(client.query(RPC_METHODS.GET_BALANCE)).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_LOCKED,
    });
    await expect(
      client.intent(INTENT_ACTIONS.SEND, { to: '@bob', amount: '1', coinId: 'aa'.repeat(32) }),
    ).rejects.toMatchObject({ code: ERROR_CODES.WALLET_LOCKED });

    expect(lockedRequests).toEqual([
      { origin: ORIGIN, kind: 'query', name: RPC_METHODS.GET_BALANCE },
      { origin: ORIGIN, kind: 'intent', name: INTENT_ACTIONS.SEND },
    ]);

    // An allow-listed method is SERVED, so it is not a locked request and notifies nothing.
    await client.query(RPC_METHODS.GET_IDENTITY);
    expect(lockedRequests).toHaveLength(2);
  });

  it('pushes wallet:locked exactly once for a repeated lock', async () => {
    const { host, seen } = await connectPair();
    host.setLocked();
    host.setLocked();
    await settle();
    expect(seen.filter((s) => s.event === WALLET_EVENTS.LOCKED)).toHaveLength(1);
  });

  it('resumes the same session on updateSphere() and reports the identity', async () => {
    const { client, host, seen, sessionId } = await connectPair();

    host.setLocked();
    await settle();
    host.updateSphere(mockSphere);
    await settle();

    expect(host.walletState).toBe('live');
    const unlocked = seen.find((s) => s.event === WALLET_EVENTS.UNLOCKED);
    expect(unlocked).toBeTruthy();
    expect((unlocked?.data as { identity?: PublicIdentity } | undefined)?.identity?.chainPubkey).toBe(
      mockSphere.identity.chainPubkey,
    );
    expect(client.session).toBe(sessionId);
    expect(client.walletLocked).toBe(false);

    const balance = await client.query(RPC_METHODS.GET_BALANCE);
    expect(Array.isArray(balance)).toBe(true);
  });

  // Connect 2.1 makes this SUCCEED — the most common entry into the feature. A dApp that
  // reloads during a lock gets a live session back plus locked: true, with no consent prompt
  // (any handshake while locked is forced silent).
  it('answers a resume handshake while locked with locked: true', async () => {
    const { loop, host, clientTransport, sessionId } = await connectPair();

    host.setLocked();
    await settle();

    // Retire the first client so it cannot swallow the second one's handshake response.
    clientTransport.destroy();

    const resumeClient = new ConnectClient({
      transport: loop.newClient(),
      dapp: DAPP,
      network: SPHERE_NETWORKS.testnet2,
      resumeSessionId: sessionId,
      timeout: 2000,
    });

    const resumed = await resumeClient.connect();
    expect(resumed.sessionId).toBe(sessionId);
    expect(resumed.locked).toBe(true);
    expect(resumeClient.walletLocked).toBe(true);
    expect(resumeClient.walletProtocol).toBe(SPHERE_CONNECT_VERSION);
  });

  // The lock screen's "Forgot password -> restore from recovery phrase" installs a DIFFERENT
  // seed behind an origin-keyed approval. The host compares chainPubkey on the locked -> live
  // edge and revokes rather than unlocking.
  it('revokes instead of unlocking when a different seed comes back', async () => {
    const { host, seen } = await connectPair();
    const otherSphere = {
      ...mockSphere,
      identity: {
        ...mockSphere.identity,
        chainPubkey: '02bbbb000000000000000000000000000000000000000000000000000000000000',
      },
    };

    host.setLocked();
    await settle();
    host.updateSphere(otherSphere);
    await settle();

    expect(seen.map((s) => s.event)).toContain(WALLET_EVENTS.DISCONNECTED);
    expect(seen.map((s) => s.event)).not.toContain(WALLET_EVENTS.UNLOCKED);
    expect(host.getSession()).toBeNull();
  });

  it('announces wallet:disconnected on revokeSession()', async () => {
    const { host, seen } = await connectPair();

    host.revokeSession();
    await settle();

    expect(seen.map((s) => s.event)).toContain(WALLET_EVENTS.DISCONNECTED);
    expect(host.getSession()).toBeNull();
  });

  // 'unavailable' is Sphere gone for a NON-lock reason. It is a dead end: unlocking cannot
  // cure it, so it revokes and answers the existing NOT_CONNECTED (4001) — there is
  // deliberately no dedicated error code.
  it('answers 4001 and revokes after setUnavailable()', async () => {
    const { client, host, seen } = await connectPair();

    host.setUnavailable();
    await settle();

    expect(host.walletState).toBe('unavailable');
    expect(host.getSession()).toBeNull();
    expect(seen.map((s) => s.event)).toContain(WALLET_EVENTS.DISCONNECTED);
    await expect(client.query(RPC_METHODS.GET_BALANCE)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_CONNECTED,
    });
  });

  it('answers sphere_subscribe for an auto-pushed event name with SUCCESS', async () => {
    const { client } = await connectPair();
    // The host pushes these unconditionally, so "you are subscribed" is true — it is just
    // satisfied by a different mechanism than Sphere.on(), which accepts any string and never
    // emits for them. This used to throw, which silently broke every dApp built before 2.1:
    // client.on('wallet:locked', …) fires sphere_subscribe fire-and-forget, and on 2.0 that
    // call succeeded.
    await expect(client.query(RPC_METHODS.SUBSCRIBE, { event: WALLET_EVENTS.UNLOCKED }))
      .resolves.toEqual({ subscribed: true, event: WALLET_EVENTS.UNLOCKED });
  });

  it('reports protocol 2.1 and ships no client-side retry surface in Release 1', async () => {
    const { client } = await connectPair();
    expect(SPHERE_CONNECT_VERSION).toBe('2.1');
    expect(client.walletProtocol).toBe('2.1');
    // Release 1 is fail-fast: no queue, no client-only 4010, and no re-subscribe API.
    expect((ERROR_CODES as Record<string, number>).REQUEST_TIMEOUT).toBeUndefined();
    expect((client as unknown as { resubscribeAll?: unknown }).resubscribeAll).toBeUndefined();
  });
});
