import { useState, useRef, useCallback } from 'react';
import { ConnectClient, HOST_READY_TYPE, HOST_READY_TIMEOUT } from '@unicitylabs/sphere-sdk/connect';
import { PostMessageTransport } from '@unicitylabs/sphere-sdk/connect/browser';
import type { PublicIdentity, RpcMethod, IntentAction } from '@unicitylabs/sphere-sdk/connect';
import type { PermissionScope } from '@unicitylabs/sphere-sdk/connect';

export interface WalletConnectState {
  isConnected: boolean;
  isConnecting: boolean;
  identity: PublicIdentity | null;
  permissions: readonly PermissionScope[];
  error: string | null;
}

export interface UseWalletConnect extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  query: <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>) => Promise<T>;
  intent: <T = unknown>(action: IntentAction | string, params: Record<string, unknown>) => Promise<T>;
  on: (event: string, handler: (data: unknown) => void) => () => void;
}

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

function isInIframe(): boolean {
  try {
    return window.parent !== window && window.self !== window.top;
  } catch {
    return true; // cross-origin iframe
  }
}

/** Wait for the wallet popup to signal it's ready */
function waitForHostReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Wallet popup did not become ready in time'));
    }, HOST_READY_TIMEOUT);

    function handler(event: MessageEvent) {
      if (event.data?.type === HOST_READY_TYPE) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve();
      }
    }
    window.addEventListener('message', handler);
  });
}

export function useWalletConnect(): UseWalletConnect {
  const [state, setState] = useState<WalletConnectState>({
    isConnected: false,
    isConnecting: false,
    identity: null,
    permissions: [],
    error: null,
  });

  const clientRef = useRef<ConnectClient | null>(null);
  const transportRef = useRef<PostMessageTransport | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupMode = useRef(false);

  /**
   * Open (or re-open) popup, create fresh transport + client, do handshake.
   * Wallet remembers approved origin so re-connect skips the approval modal.
   */
  const openPopupAndConnect = useCallback(async (): Promise<ConnectClient> => {
    // Reuse existing popup window if still open, otherwise open new one
    if (!popupRef.current || popupRef.current.closed) {
      const popup = window.open(
        WALLET_URL + '/connect?origin=' + encodeURIComponent(location.origin),
        'sphere-wallet',
        'width=420,height=650',
      );
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      popupRef.current = popup;
    } else {
      popupRef.current.focus();
    }

    // Fresh transport for this popup instance
    transportRef.current?.destroy();
    const transport = PostMessageTransport.forClient({
      target: popupRef.current,
      targetOrigin: WALLET_URL,
    });
    transportRef.current = transport;

    // Wait until wallet's ConnectHost is ready
    await waitForHostReady();

    const client = new ConnectClient({
      transport,
      dapp: {
        name: 'Connect Demo',
        description: 'Sphere Connect browser example',
        url: location.origin,
      },
    });
    clientRef.current = client;

    const result = await client.connect();

    setState({
      isConnected: true,
      isConnecting: false,
      identity: result.identity,
      permissions: result.permissions,
      error: null,
    });

    return client;
  }, []);

  /**
   * Ensure we have a working client.
   * If popup was closed by user, treat as disconnect — do NOT reopen automatically.
   */
  const ensureClient = useCallback(async (): Promise<ConnectClient> => {
    // Iframe mode — client should be alive
    if (clientRef.current && !popupMode.current) {
      return clientRef.current;
    }

    // Popup mode — check if popup is still open
    if (clientRef.current && popupMode.current && popupRef.current && !popupRef.current.closed) {
      return clientRef.current;
    }

    // Popup was closed — treat as disconnected, clean up state
    if (popupMode.current && (!popupRef.current || popupRef.current.closed)) {
      transportRef.current?.destroy();
      clientRef.current = null;
      transportRef.current = null;
      popupRef.current = null;
      popupMode.current = false;

      setState({
        isConnected: false,
        isConnecting: false,
        identity: null,
        permissions: [],
        error: null,
      });

      throw new Error('Wallet popup was closed');
    }

    throw new Error('Not connected');
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      if (isInIframe()) {
        popupMode.current = false;
        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;

        const client = new ConnectClient({
          transport,
          dapp: {
            name: 'Connect Demo',
            description: 'Sphere Connect browser example',
            url: location.origin,
          },
        });
        clientRef.current = client;

        const result = await client.connect();
        setState({
          isConnected: true,
          isConnecting: false,
          identity: result.identity,
          permissions: result.permissions,
          error: null,
        });
      } else {
        popupMode.current = true;
        await openPopupAndConnect();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, [openPopupAndConnect]);

  const disconnect = useCallback(async () => {
    try {
      await clientRef.current?.disconnect();
    } catch {
      // ignore
    }
    transportRef.current?.destroy();
    clientRef.current = null;
    transportRef.current = null;
    popupRef.current?.close();
    popupRef.current = null;
    popupMode.current = false;

    setState({
      isConnected: false,
      isConnecting: false,
      identity: null,
      permissions: [],
      error: null,
    });
  }, []);

  const query = useCallback(
    async <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>): Promise<T> => {
      const client = await ensureClient();
      return client.query<T>(method, params);
    },
    [ensureClient],
  );

  const intent = useCallback(
    async <T = unknown>(action: IntentAction | string, params: Record<string, unknown>): Promise<T> => {
      const client = await ensureClient();
      return client.intent<T>(action, params);
    },
    [ensureClient],
  );

  const on = useCallback((event: string, handler: (data: unknown) => void): (() => void) => {
    if (!clientRef.current) throw new Error('Not connected');
    return clientRef.current.on(event, handler);
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    query,
    intent,
    on,
  };
}
