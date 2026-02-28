import { useState, useRef, useCallback, useEffect } from 'react';
import { ConnectClient, HOST_READY_TYPE, HOST_READY_TIMEOUT } from '@unicitylabs/sphere-sdk/connect';
import { PostMessageTransport, ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser';
import type { ConnectTransport, PublicIdentity, RpcMethod, IntentAction } from '@unicitylabs/sphere-sdk/connect';
import type { PermissionScope } from '@unicitylabs/sphere-sdk/connect';
import { isInIframe, hasExtension } from '../lib/detection';

export interface WalletConnectState {
  isConnected: boolean;
  isConnecting: boolean;
  identity: PublicIdentity | null;
  permissions: readonly PermissionScope[];
  error: string | null;
}

export interface UseWalletConnect extends WalletConnectState {
  connect: () => Promise<void>;
  connectViaExtension: () => Promise<void>;
  connectViaPopup: () => Promise<void>;
  disconnect: () => Promise<void>;
  query: <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>) => Promise<T>;
  intent: <T = unknown>(action: IntentAction | string, params: Record<string, unknown>) => Promise<T>;
  on: (event: string, handler: (data: unknown) => void) => () => void;
  /** True only during the initial silent check on page load — hides the Connect button to avoid flash. */
  isAutoConnecting: boolean;
  /** True if the Sphere browser extension is detected. */
  extensionInstalled: boolean;
}

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

// sessionStorage key for popup session resume (P3 only)
const SESSION_KEY_POPUP = 'sphere-connect-popup-session';

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
  // When extension is installed, start with isAutoConnecting=true to avoid a flash
  // of the Connect button while the silent check is in progress on mount.
  const willSilentCheck = !isInIframe() && hasExtension();

  const [isAutoConnecting, setIsAutoConnecting] = useState(willSilentCheck);

  const [state, setState] = useState<WalletConnectState>({
    isConnected: false,
    isConnecting: false,
    identity: null,
    permissions: [],
    error: null,
  });

  const clientRef = useRef<ConnectClient | null>(null);
  const transportRef = useRef<ConnectTransport | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupMode = useRef(false);

  const dappMeta = {
    name: 'Connect Demo',
    description: 'Sphere Connect browser example',
    url: location.origin,
  } as const;

  /**
   * Open (or re-open) popup, create fresh transport + client, do handshake.
   * Wallet remembers approved origin so re-connect skips the approval modal.
   */
  const openPopupAndConnect = useCallback(async (): Promise<ConnectClient> => {
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

    transportRef.current?.destroy();
    const transport = PostMessageTransport.forClient({
      target: popupRef.current,
      targetOrigin: WALLET_URL,
    });
    transportRef.current = transport;

    await waitForHostReady();

    const resumeSessionId = sessionStorage.getItem(SESSION_KEY_POPUP) ?? undefined;
    const client = new ConnectClient({ transport, dapp: dappMeta, resumeSessionId });
    clientRef.current = client;

    const result = await client.connect();
    sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId);

    setState({
      isConnected: true,
      isConnecting: false,
      identity: result.identity,
      permissions: result.permissions,
      error: null,
    });

    return client;
  }, [dappMeta]);

  /**
   * Ensure we have a working client.
   * If popup was closed by user, treat as disconnect — do NOT reopen automatically.
   */
  const ensureClient = useCallback(async (): Promise<ConnectClient> => {
    if (clientRef.current && !popupMode.current) {
      return clientRef.current;
    }

    if (clientRef.current && popupMode.current && popupRef.current && !popupRef.current.closed) {
      return clientRef.current;
    }

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

  const connectViaExtension = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      popupMode.current = false;
      const transport = ExtensionTransport.forClient();
      transportRef.current = transport;
      const client = new ConnectClient({ transport, dapp: dappMeta });
      clientRef.current = client;
      const result = await client.connect();
      setState({ isConnected: true, isConnecting: false, identity: result.identity, permissions: result.permissions, error: null });
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [dappMeta]);

  const connectViaPopup = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      popupMode.current = true;
      await openPopupAndConnect();
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [openPopupAndConnect]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      if (isInIframe()) {
        // P1: embedded inside Sphere iframe — talk to parent window directly
        popupMode.current = false;
        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;

        const client = new ConnectClient({ transport, dapp: dappMeta });
        clientRef.current = client;

        const result = await client.connect();
        setState({
          isConnected: true,
          isConnecting: false,
          identity: result.identity,
          permissions: result.permissions,
          error: null,
        });
      } else if (hasExtension()) {
        await connectViaExtension();
      } else {
        await connectViaPopup();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, [openPopupAndConnect, dappMeta]);

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

    sessionStorage.removeItem(SESSION_KEY_POPUP);

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

  // On mount: if extension is installed, silently check if this origin is already approved.
  // If yes — restore the connection without any UI. If no — show the Connect button immediately.
  useEffect(() => {
    if (!isInIframe() && hasExtension()) {
      const silentCheck = async () => {
        popupMode.current = false;
        const transport = ExtensionTransport.forClient();
        transportRef.current = transport;

        const client = new ConnectClient({ transport, dapp: dappMeta, silent: true });
        clientRef.current = client;

        try {
          const result = await client.connect();
          setState({
            isConnected: true,
            isConnecting: false,
            identity: result.identity,
            permissions: result.permissions,
            error: null,
          });
        } catch {
          // Origin not approved — clean up and show Connect button (no error message)
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      };

      silentCheck().finally(() => setIsAutoConnecting(false));
    } else {
      setIsAutoConnecting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    connect,
    connectViaExtension,
    connectViaPopup,
    disconnect,
    query,
    intent,
    on,
    isAutoConnecting,
    extensionInstalled: hasExtension(),
  };
}
