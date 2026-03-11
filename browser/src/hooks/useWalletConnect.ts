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
  /** True when the wallet needs the user to open the popup for an intent/approval. */
  needsPopup: boolean;
  /** Open the approval popup (for bridge mode). */
  openApprovalPopup: () => void;
}

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

// sessionStorage key for popup session resume (P3 only)
const SESSION_KEY_POPUP = 'sphere-connect-popup-session';

// localStorage key: set after a successful bridge connection so we know to try it on next load
const BRIDGE_APPROVED_KEY = 'sphere-connect-bridge-approved';

// Message type sent by the bridge iframe when popup interaction is needed
const OPEN_POPUP_MSG = 'sphere-connect:open-popup';

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
  // Start with isAutoConnecting=true to avoid a flash of the Connect button
  // while silent check (iframe/extension/bridge) is in progress on mount.
  // Always try silent check: extension, bridge iframe, or popup session resume
  const willSilentCheck = true;

  const [isAutoConnecting, setIsAutoConnecting] = useState(willSilentCheck);
  const [needsPopup, setNeedsPopup] = useState(false);

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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const popupMode = useRef(false);
  const bridgeMode = useRef(false);
  const bridgeReadyRef = useRef(false); // true after bridge iframe sent HOST_READY

  const dappMeta = {
    name: 'Connect Demo',
    description: 'Sphere Connect browser example',
    url: location.origin,
  } as const;

  // ---------------------------------------------------------------------------
  // Bridge iframe helpers
  // ---------------------------------------------------------------------------

  /** Create a hidden iframe pointing to the sphere connect-bridge route. */
  const createBridgeIframe = useCallback((): HTMLIFrameElement => {
    const existing = document.getElementById('sphere-connect-bridge') as HTMLIFrameElement | null;
    if (existing) return existing;

    const iframe = document.createElement('iframe');
    iframe.id = 'sphere-connect-bridge';
    iframe.src = WALLET_URL + '/connect-bridge?origin=' + encodeURIComponent(location.origin);
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    return iframe;
  }, []);

  /** Wait for HOST_READY from the bridge iframe. */
  const waitForBridgeReady = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Bridge iframe did not become ready in time'));
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
  }, []);

  /** Connect via hidden bridge iframe (always silent — used for auto-reconnect). */
  const connectViaBridge = useCallback(async (): Promise<ConnectClient | null> => {
    console.log('[WalletConnect] connectViaBridge (silent), bridgeReady:', bridgeReadyRef.current);
    const iframe = createBridgeIframe();
    iframeRef.current = iframe;

    // Only wait for HOST_READY if we haven't received it yet
    if (!bridgeReadyRef.current) {
      console.log('[WalletConnect] waiting for bridge iframe ready...');
      await waitForBridgeReady();
      bridgeReadyRef.current = true;
    }
    console.log('[WalletConnect] bridge iframe ready');

    const transport = PostMessageTransport.forClient({
      target: iframe.contentWindow!,
      targetOrigin: WALLET_URL,
    });
    transportRef.current = transport;

    const client = new ConnectClient({ transport, dapp: dappMeta, silent: true });
    clientRef.current = client;

    try {
      console.log('[WalletConnect] bridge: calling client.connect()...');
      const result = await client.connect();
      console.log('[WalletConnect] bridge connected!', result.identity);
      bridgeMode.current = true;
      popupMode.current = false;
      localStorage.setItem(BRIDGE_APPROVED_KEY, '1');

      setState({
        isConnected: true,
        isConnecting: false,
        identity: result.identity,
        permissions: result.permissions,
        error: null,
      });

      return client;
    } catch (err) {
      console.warn('[WalletConnect] bridge connect failed', err);
      transportRef.current?.destroy();
      clientRef.current = null;
      transportRef.current = null;
      return null;
    }
  }, [createBridgeIframe, waitForBridgeReady, dappMeta]);

  // ---------------------------------------------------------------------------
  // Open approval popup (for bridge mode intents)
  // ---------------------------------------------------------------------------

  const openApprovalPopup = useCallback(() => {
    const origin = encodeURIComponent(location.origin);
    const popup = window.open(
      WALLET_URL + '/connect?origin=' + origin + '&bridge',
      'sphere-wallet',
      'width=420,height=650',
    );
    if (popup) {
      popupRef.current = popup;
    }
    setNeedsPopup(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Popup-only connection (P3 fallback)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // ensureClient
  // ---------------------------------------------------------------------------

  const ensureClient = useCallback(async (): Promise<ConnectClient> => {
    // Bridge mode: client stays alive as long as iframe exists
    if (clientRef.current && bridgeMode.current) {
      return clientRef.current;
    }

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

  // ---------------------------------------------------------------------------
  // Public connect methods
  // ---------------------------------------------------------------------------

  const connectViaExtension = useCallback(async () => {
    console.log('[WalletConnect] connectViaExtension');
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      popupMode.current = false;
      bridgeMode.current = false;
      const transport = ExtensionTransport.forClient();
      transportRef.current = transport;
      const client = new ConnectClient({ transport, dapp: dappMeta });
      clientRef.current = client;
      const result = await client.connect();
      console.log('[WalletConnect] extension connected', result.identity);
      setState({ isConnected: true, isConnecting: false, identity: result.identity, permissions: result.permissions, error: null });
    } catch (err) {
      console.warn('[WalletConnect] extension failed', err);
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [dappMeta]);

  const connectViaPopup = useCallback(async () => {
    console.log('[WalletConnect] connectViaPopup called');
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      if (isInIframe()) {
        popupMode.current = false;
        bridgeMode.current = false;
        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;
        const client = new ConnectClient({ transport, dapp: dappMeta });
        clientRef.current = client;
        const result = await client.connect();
        setState({ isConnected: true, isConnecting: false, identity: result.identity, permissions: result.permissions, error: null });
        return;
      }

      // Open popup for approval
      popupMode.current = true;
      bridgeMode.current = false;
      const popupClient = await openPopupAndConnect();

      // Disarm popup-close detector before bridge takeover
      const popupTransport = transportRef.current;
      const popupWindow = popupRef.current;
      popupRef.current = null;
      popupMode.current = false;

      // Try switching to bridge iframe for persistence
      console.log('[WalletConnect] connectViaPopup: popup succeeded, switching to bridge...');
      const bridgeClient = await connectViaBridge();
      if (bridgeClient) {
        console.log('[WalletConnect] connectViaPopup: bridge takeover succeeded');
        popupClient.disconnect().catch(() => {});
        popupTransport?.destroy();
        popupWindow?.close();
      } else {
        console.log('[WalletConnect] connectViaPopup: bridge takeover failed, keeping popup');
        popupMode.current = true;
        popupRef.current = popupWindow;
        transportRef.current = popupTransport;
        clientRef.current = popupClient;
      }
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [openPopupAndConnect, connectViaBridge, dappMeta]);

  const connect = useCallback(async () => {
    console.log('[WalletConnect] connect() called. isInIframe:', isInIframe(), 'hasExtension:', hasExtension());
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      if (isInIframe()) {
        popupMode.current = false;
        bridgeMode.current = false;

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
        return;
      }

      // P1: Try extension
      if (hasExtension()) {
        console.log('[WalletConnect] connect: trying extension...');
        try {
          popupMode.current = false;
          bridgeMode.current = false;
          const transport = ExtensionTransport.forClient();
          transportRef.current = transport;
          const client = new ConnectClient({ transport, dapp: dappMeta });
          clientRef.current = client;
          const result = await client.connect();
          console.log('[WalletConnect] connect: extension succeeded');
          setState({ isConnected: true, isConnecting: false, identity: result.identity, permissions: result.permissions, error: null });
          return;
        } catch (err) {
          console.log('[WalletConnect] connect: extension failed, trying popup...', err);
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      }

      // P2: Open popup directly for first-time approval.
      // Bridge iframe is for auto-reconnect on reload (after origin is approved).
      // We can't use bridge here because popup would be blocked (user gesture expired
      // by the time iframe loads and requests approval).
      console.log('[WalletConnect] connect: opening popup for approval...');
      popupMode.current = true;
      bridgeMode.current = false;
      const popupClient = await openPopupAndConnect();

      // Save popup refs before bridge overwrites them, and immediately
      // disarm the popup-close detector so it won't fire during bridge takeover.
      const popupTransport = transportRef.current;
      const popupWindow = popupRef.current;
      popupRef.current = null;  // prevents popup-close detector from triggering
      popupMode.current = false;

      // After successful popup connection, the origin is now approved in sphere's
      // localStorage. Switch to bridge iframe for persistence — close popup,
      // session stays alive in iframe.
      console.log('[WalletConnect] connect: popup succeeded, switching to bridge...');
      const bridgeClient = await connectViaBridge();
      if (bridgeClient) {
        console.log('[WalletConnect] connect: bridge takeover succeeded, closing popup');
        // Bridge took over — clean up popup resources (NOT the bridge ones!)
        popupClient.disconnect().catch(() => {});
        popupTransport?.destroy();
        popupWindow?.close();
      } else {
        console.log('[WalletConnect] connect: bridge takeover failed, keeping popup');
        // Bridge failed — restore popup refs that connectViaBridge may have overwritten
        popupMode.current = true;
        popupRef.current = popupWindow;
        transportRef.current = popupTransport;
        clientRef.current = popupClient;
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, [openPopupAndConnect, connectViaBridge, dappMeta]);

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

    // Remove bridge iframe
    if (iframeRef.current) {
      iframeRef.current.remove();
      iframeRef.current = null;
    }
    bridgeMode.current = false;
    bridgeReadyRef.current = false;

    sessionStorage.removeItem(SESSION_KEY_POPUP);
    localStorage.removeItem(BRIDGE_APPROVED_KEY);
    setNeedsPopup(false);

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

  // ---------------------------------------------------------------------------
  // Listen for "open-popup" messages from bridge iframe (for intents after connection)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === OPEN_POPUP_MSG && bridgeMode.current) {
        console.log('[WalletConnect] bridge needs popup for intent');
        setNeedsPopup(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ---------------------------------------------------------------------------
  // Poll for popup window closure (popup-only P3 mode)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!state.isConnected || !popupMode.current) return;

    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        clearInterval(interval);
        transportRef.current?.destroy();
        clientRef.current = null;
        transportRef.current = null;
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
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isConnected]);

  // ---------------------------------------------------------------------------
  // On mount: try to restore connection automatically.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    console.log('[WalletConnect] mount: isInIframe:', isInIframe(), 'hasExtension:', hasExtension(), 'savedPopup:', !!sessionStorage.getItem(SESSION_KEY_POPUP));
    if (isInIframe()) {
      const silentCheck = async () => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', readyHandler);
            reject(new Error('Host not ready'));
          }, 5000);
          function readyHandler(e: MessageEvent) {
            if (e.data?.type === HOST_READY_TYPE) {
              clearTimeout(timer);
              window.removeEventListener('message', readyHandler);
              resolve();
            }
          }
          window.addEventListener('message', readyHandler);
        });

        popupMode.current = false;
        bridgeMode.current = false;
        const transport = PostMessageTransport.forClient();
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
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      };
      silentCheck().finally(() => setIsAutoConnecting(false));
      return;
    }

    // Try extension first, then bridge iframe, then popup session resume
    const silentCheck = async () => {
      // P1: Extension
      if (hasExtension()) {
        console.log('[WalletConnect] mount: extension detected, trying silent check');
        try {
          popupMode.current = false;
          bridgeMode.current = false;
          const transport = ExtensionTransport.forClient();
          transportRef.current = transport;
          const client = new ConnectClient({ transport, dapp: dappMeta, silent: true });
          clientRef.current = client;
          const result = await client.connect();
          console.log('[WalletConnect] mount: extension silent check succeeded');
          setState({
            isConnected: true,
            isConnecting: false,
            identity: result.identity,
            permissions: result.permissions,
            error: null,
          });
          return; // Connected via extension
        } catch (err) {
          console.log('[WalletConnect] mount: extension silent check failed', err);
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      }

      // P2: Bridge iframe (only if previously approved)
      if (localStorage.getItem(BRIDGE_APPROVED_KEY)) {
        console.log('[WalletConnect] mount: trying bridge iframe');
        const client = await connectViaBridge();
        if (client) {
          console.log('[WalletConnect] mount: bridge connected');
          return;
        }
        console.log('[WalletConnect] mount: bridge failed, checking popup session');
      }

      // P3: Popup session resume
      const savedSession = sessionStorage.getItem(SESSION_KEY_POPUP);
      if (savedSession) {
        popupMode.current = true;
        bridgeMode.current = false;
        try {
          await openPopupAndConnect();
        } catch {
          sessionStorage.removeItem(SESSION_KEY_POPUP);
        }
      }
    };

    silentCheck().finally(() => setIsAutoConnecting(false));
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
    needsPopup,
    openApprovalPopup,
  };
}
