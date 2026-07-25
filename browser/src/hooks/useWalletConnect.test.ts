import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ConnectError, ERROR_CODES, HOST_READY_TYPE, RPC_METHODS, WALLET_EVENTS } from '@unicitylabs/sphere-sdk/connect';
import { FakeConnectClient, FAKE_IDENTITY } from '../test/fakeConnectClient';
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
