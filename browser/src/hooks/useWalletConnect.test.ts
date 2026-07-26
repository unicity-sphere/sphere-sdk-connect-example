import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ConnectError, ERROR_CODES, HOST_READY_TYPE, RPC_METHODS, WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';
import { FakeConnectClient, FAKE_IDENTITY, OTHER_IDENTITY } from '../test/fakeConnectClient';
import { useWalletConnect } from './useWalletConnect';

// Hoisted so the vi.mock factories below — which run before this file's own declarations —
// can reach it.
const mocks = vi.hoisted(() => {
  const transportDestroys: string[] = [];
  return {
    transportDestroys,
    makeTransport: () => ({
      send: () => {},
      onMessage: () => () => {},
      destroy: () => {
        transportDestroys.push('destroy');
      },
    }),
  };
});

vi.mock('@unicitylabs/sphere-sdk/connect/browser', () => ({
  PostMessageTransport: { forClient: () => mocks.makeTransport() },
  ExtensionTransport: { forClient: () => mocks.makeTransport() },
}));

vi.mock('@unicitylabs/sphere-sdk/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@unicitylabs/sphere-sdk/connect')>();
  const { FakeConnectClient: Fake } = await import('../test/fakeConnectClient');
  return { ...actual, ConnectClient: Fake };
});

const SESSION_KEY_POPUP = 'sphere-connect-popup-session';

type Hook = ReturnType<typeof useWalletConnect>;

/** Drive the popup connect path: it opens a window, then blocks on HOST_READY. */
async function connectPopup(result: { current: Hook }): Promise<void> {
  await act(async () => {
    const pending = result.current.connectViaPopup();
    // waitForHostReady() registers its listener synchronously, before connectViaPopup()
    // hands back its promise, so dispatching here is not a race.
    window.dispatchEvent(new MessageEvent('message', { data: { type: HOST_READY_TYPE } }));
    await pending;
  });
}

async function mountAndConnect() {
  const hook = renderHook(() => useWalletConnect());
  await waitFor(() => expect(hook.result.current.isAutoConnecting).toBe(false));
  await connectPopup(hook.result);
  expect(hook.result.current.isConnected).toBe(true);
  mocks.transportDestroys.length = 0;
  return hook;
}

beforeEach(() => {
  FakeConnectClient.reset();
  mocks.transportDestroys.length = 0;
  sessionStorage.clear();
  vi.spyOn(window, 'open').mockReturnValue({
    closed: false,
    focus: () => {},
    close: () => {},
  } as unknown as Window);
});

describe('useWalletConnect — connect', () => {
  it('connects through the popup and saves the session id', async () => {
    const { result } = await mountAndConnect();
    expect(result.current.identity?.chainPubkey).toBe(FAKE_IDENTITY.chainPubkey);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-1');
    expect(result.current.isWalletLocked).toBe(false);
  });
});

describe('useWalletConnect — wallet:locked', () => {
  it('keeps the session alive when the wallet speaks Connect 2.1', async () => {
    const { result } = await mountAndConnect();

    act(() => {
      FakeConnectClient.last.emit(WALLET_EVENTS.LOCKED, {});
    });

    expect(result.current.isWalletLocked).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.identity?.chainPubkey).toBe(FAKE_IDENTITY.chainPubkey);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-1');
    expect(mocks.transportDestroys).toHaveLength(0);
  });

  // A 2.0 wallet means the OPPOSITE by the same event name: the removed
  // notifyWalletLocked() pushed wallet:locked AND revoked the session, and wallet:unlocked
  // will never arrive. Staying "connected" against it would leave the dApp waiting forever
  // on a locked screen.
  it('tears down when the wallet still speaks Connect 2.0', async () => {
    FakeConnectClient.nextWalletProtocol = '2.0';
    const { result } = await mountAndConnect();

    act(() => {
      FakeConnectClient.last.emit(WALLET_EVENTS.LOCKED, {});
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isWalletLocked).toBe(false);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBeNull();
    expect(mocks.transportDestroys).toHaveLength(1);
  });
});

describe('useWalletConnect — request failures', () => {
  it('flags the lock instead of disconnecting when a query answers 4009', async () => {
    const { result } = await mountAndConnect();
    FakeConnectClient.last.queryError = new ConnectError('Wallet is locked', ERROR_CODES.WALLET_LOCKED, {
      reason: 'locked',
    });

    let caught: unknown;
    await act(async () => {
      caught = await result.current.query(RPC_METHODS.GET_BALANCE).catch((e: unknown) => e);
    });

    expect((caught as ConnectError).code).toBe(ERROR_CODES.WALLET_LOCKED);
    expect((caught as ConnectError).data).toEqual({ reason: 'locked' });
    expect(result.current.isWalletLocked).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-1');
    expect(mocks.transportDestroys).toHaveLength(0);
  });

  it('does not disconnect on a typed refusal the session survives', async () => {
    const { result } = await mountAndConnect();
    FakeConnectClient.last.queryError = new ConnectError('Permission denied', ERROR_CODES.PERMISSION_DENIED);

    await act(async () => {
      await result.current.query(RPC_METHODS.GET_BALANCE).catch(() => {});
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isWalletLocked).toBe(false);
    expect(mocks.transportDestroys).toHaveLength(0);
  });

  it('preserves isWalletLocked when a codeless timeout forces a teardown', async () => {
    const { result } = await mountAndConnect();
    act(() => FakeConnectClient.last.emit(WALLET_EVENTS.LOCKED, {}));
    FakeConnectClient.last.queryError = new Error('Query timeout: sphere_getBalance');

    await act(async () => {
      await result.current.query(RPC_METHODS.GET_BALANCE).catch(() => {});
    });

    expect(result.current.isConnected).toBe(false);
    // The teardown must NOT assign the whole DISCONNECTED constant over the lock flag —
    // the wallet is still locked and the UI must keep saying so.
    expect(result.current.isWalletLocked).toBe(true);
  });
});
describe('useWalletConnect — wallet:unlocked', () => {
  it('resumes the same session without re-subscribing when the same wallet returns', async () => {
    const { result } = await mountAndConnect();
    const client = FakeConnectClient.last;
    const registrationsBeforeUnlock = client.onCalls.length;

    act(() => client.emit(WALLET_EVENTS.LOCKED, {}));
    act(() => client.emit(WALLET_EVENTS.UNLOCKED, { identity: FAKE_IDENTITY }));

    expect(result.current.isWalletLocked).toBe(false);
    expect(result.current.walletChanged).toBe(false);
    expect(result.current.unlockEpoch).toBe(1);
    expect(result.current.isConnected).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-1');
    // The host re-arms every suspended subscription BEFORE pushing wallet:unlocked, so a dApp
    // must send nothing here. A client-side re-subscribe would mean a dApp that never
    // upgrades loses its event streams forever.
    expect(client.onCalls).toHaveLength(registrationsBeforeUnlock);
    expect(client.queries).toHaveLength(0);
  });

  // "Forgot password -> restore from recovery phrase" on the wallet's lock screen installs a
  // DIFFERENT seed, and the origin approval that authorises this session carries no identity
  // binding. The host's own lock-edge guard revokes instead of unlocking, but a dApp must
  // still render honestly if it ever sees a mismatching payload.
  it('flags a different wallet and resumes nothing against it', async () => {
    const { result } = await mountAndConnect();
    const client = FakeConnectClient.last;

    act(() => client.emit(WALLET_EVENTS.LOCKED, {}));
    act(() => client.emit(WALLET_EVENTS.UNLOCKED, { identity: OTHER_IDENTITY }));

    expect(result.current.isWalletLocked).toBe(false);
    expect(result.current.walletChanged).toBe(true);
    expect(result.current.unlockEpoch).toBe(0);
    expect(result.current.identity?.chainPubkey).toBe(OTHER_IDENTITY.chainPubkey);
  });

  it('treats an identity-less unlock payload as a changed wallet', async () => {
    const { result } = await mountAndConnect();
    const client = FakeConnectClient.last;

    act(() => client.emit(WALLET_EVENTS.LOCKED, {}));
    act(() => client.emit(WALLET_EVENTS.UNLOCKED, {}));

    expect(result.current.walletChanged).toBe(true);
    expect(result.current.unlockEpoch).toBe(0);
  });
});

describe('useWalletConnect — wallet:disconnected', () => {
  it('tears the connection down and clears the saved session', async () => {
    const { result } = await mountAndConnect();

    act(() => FakeConnectClient.last.emit(WALLET_EVENTS.DISCONNECTED, {}));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isWalletLocked).toBe(false);
    expect(result.current.identity).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBeNull();
    expect(mocks.transportDestroys).toHaveLength(1);
  });
});
describe('useWalletConnect — HOST_READY', () => {
  it('does not re-handshake on the HOST_READY that belongs to its own connect', async () => {
    await mountAndConnect();
    expect(FakeConnectClient.instances).toHaveLength(1);
  });

  // A wallet page reload — which is exactly what a reload during a lock looks like — leaves the
  // dApp talking to a ConnectHost that no longer exists. The replacement host re-announces
  // HOST_READY; resume the SAME session silently, because the persisted origin approval
  // survives the reload and the user must not be re-prompted for consent.
  it('re-handshakes with the saved session id when the host announces HOST_READY again', async () => {
    const { result } = await mountAndConnect();
    FakeConnectClient.nextSessionId = 'session-2';

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: HOST_READY_TYPE } }));
      await Promise.resolve();
    });
    await waitFor(() => expect(FakeConnectClient.instances).toHaveLength(2));

    expect(FakeConnectClient.last.options.resumeSessionId).toBe('session-1');
    expect(FakeConnectClient.last.options.silent).toBe(true);
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-2');
    expect(result.current.isConnected).toBe(true);
  });
});

describe('useWalletConnect — resume onto a locked wallet', () => {
  // The most common entry into this feature: the wallet was already locked when the dApp
  // resumed. Connect 2.1 makes that handshake SUCCEED and carries locked: true, so the dApp is
  // connected AND locked in one state — no refusal, no reconnect loop, no consent prompt.
  it('is connected and locked when the handshake response carries locked: true', async () => {
    FakeConnectClient.nextLocked = true;
    const { result } = await mountAndConnect();

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isWalletLocked).toBe(true);
    expect(result.current.walletProtocol).toBe('2.1');
    expect(sessionStorage.getItem(SESSION_KEY_POPUP)).toBe('session-1');
    expect(mocks.transportDestroys).toHaveLength(0);
  });
});

describe('useWalletConnect — a connect attempt that met a locked wallet', () => {
  /**
   * Drives a popup attempt that FAILS while the popup stays open — the shape of every
   * failure against a wallet that cannot serve yet. The window mock reports `closed: false`
   * throughout, which is what the real popup does: a failed attempt is the one path that
   * does not close it.
   */
  async function failedAttempt(hook: { result: { current: Hook } }) {
    FakeConnectClient.nextConnectError = new Error('Connection rejected by wallet');
    await act(async () => {
      const pending = hook.result.current.connectViaPopup();
      window.dispatchEvent(new MessageEvent('message', { data: { type: HOST_READY_TYPE } }));
      await pending;
    });
    expect(hook.result.current.isConnected).toBe(false);
    FakeConnectClient.nextConnectError = null;
  }

  it('retries itself when the wallet announces it can serve, with no second click', async () => {
    const hook = renderHook(() => useWalletConnect());
    await waitFor(() => expect(hook.result.current.isAutoConnecting).toBe(false));
    await failedAttempt(hook);

    // The human unlocks; ConnectPage announces on the locked -> live re-arm. The listener is
    // armed even though we are NOT connected — gating it on isConnected is what swallowed
    // this and left the user clicking Connect at a wallet that was already ready.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: HOST_READY_TYPE } }));
      await Promise.resolve();
    });

    await waitFor(() => expect(hook.result.current.isConnected).toBe(true));
    expect(hook.result.current.identity?.chainPubkey).toBe(FAKE_IDENTITY.chainPubkey);
  });

  it('does not block on HOST_READY when the popup is already open', async () => {
    const hook = renderHook(() => useWalletConnect());
    await waitFor(() => expect(hook.result.current.isAutoConnecting).toBe(false));
    await failedAttempt(hook);

    // The user unlocks and clicks Connect again. That window has already booted and already
    // announced, so nothing will announce a second time — waiting would hang for the full
    // timeout, which is the reported bug. No readiness bit is remembered either: readiness
    // is not monotonic, so a remembered bit would go stale with nothing to clear it.
    await act(async () => {
      await hook.result.current.connectViaPopup();
    });

    expect(hook.result.current.isConnected).toBe(true);
  });

  it('ignores the announcement that belongs to an attempt already in flight', async () => {
    const hook = renderHook(() => useWalletConnect());
    await waitFor(() => expect(hook.result.current.isAutoConnecting).toBe(false));

    await connectPopup(hook.result);

    // One client: the attempt consumed its own announcement. A listener that also acted on it
    // would build a second client for the same handshake.
    expect(FakeConnectClient.instances).toHaveLength(1);
    expect(hook.result.current.isConnected).toBe(true);
  });
});
