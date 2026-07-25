import { useState, useRef, useCallback, useEffect } from 'react';
import { ConnectClient, HOST_READY_TYPE, HOST_READY_TIMEOUT, WALLET_EVENTS, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';
import { PostMessageTransport, ExtensionTransport } from '@unicitylabs/sphere-sdk/connect/browser';
import type { ConnectTransport, PublicIdentity, RpcMethod, IntentAction } from '@unicitylabs/sphere-sdk/connect';
import type { PermissionScope } from '@unicitylabs/sphere-sdk/connect';
import { isInIframe, hasExtension } from '../lib/detection';
import { classifyRequestError } from '../lib/connectErrors';
import { supportsGracefulLock } from '../lib/walletProtocol';

export interface WalletConnectState {
  isConnected: boolean;
  isConnecting: boolean;
  /** The wallet is locked. Under Connect >= 2.1 the session, the granted permissions and the
   *  transport are all ALIVE — requests are answered WALLET_LOCKED (4009) until the host
   *  pushes wallet:unlocked. Against a 2.0 wallet the connection is torn down instead. */
  isWalletLocked: boolean;
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

// Reusable disconnected state to avoid repeating isWalletLocked everywhere
const DISCONNECTED: WalletConnectState = {
  isConnected: false,
  isConnecting: false,
  isWalletLocked: false,
  identity: null,
  permissions: [],
  error: null,
};

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

// sessionStorage key for popup session resume (P3 only)
const SESSION_KEY_POPUP = 'sphere-connect-popup-session';

/** Wait for the wallet popup to signal it's ready */
function waitForHostReady(timeoutMs = HOST_READY_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Wallet popup did not become ready in time'));
    }, timeoutMs);

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
  // while silent check (iframe/extension) or popup session resume is in progress on mount.
  const willSilentCheck = isInIframe() || hasExtension() || !!sessionStorage.getItem(SESSION_KEY_POPUP);

  const [isAutoConnecting, setIsAutoConnecting] = useState(willSilentCheck);

  const [state, setState] = useState<WalletConnectState>(DISCONNECTED);

  const clientRef = useRef<ConnectClient | null>(null);
  const transportRef = useRef<ConnectTransport | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupMode = useRef(false);

  const dappMeta = {
    name: 'Connect Demo',
    description: 'Sphere Connect browser example',
    url: location.origin,
  } as const;

  const makeClient = (
    transport: ConnectTransport,
    extra: { resumeSessionId?: string; silent?: boolean } = {},
  ): ConnectClient =>
    new ConnectClient({ transport, dapp: dappMeta, network: SPHERE_NETWORKS.testnet2, ...extra });

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
    const client = makeClient(transport, { resumeSessionId });
    clientRef.current = client;

    const result = await client.connect();
    sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId);

    setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });

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

      setState(DISCONNECTED);

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
      const client = makeClient(transport);
      clientRef.current = client;
      const result = await client.connect();
      setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [dappMeta]);

  const connectViaPopup = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      if (isInIframe()) {
        // Inside Sphere iframe — connect to parent via PostMessage (shows modals in Sphere)
        // No waitForHostReady() needed — ConnectHost is already created by the time the
        // user can interact with the iframe and click the Connect button.
        popupMode.current = false;
        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;
        const client = makeClient(transport);
        clientRef.current = client;
        const result = await client.connect();
        setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
      } else {
        // Outside iframe — open popup window
        popupMode.current = true;
        await openPopupAndConnect();
      }
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [openPopupAndConnect, dappMeta]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      if (isInIframe()) {
        // P1: embedded inside Sphere iframe — talk to parent window directly
        // No waitForHostReady() — ConnectHost is already created by the time user clicks
        popupMode.current = false;

        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;

        const client = makeClient(transport);
        clientRef.current = client;

        const result = await client.connect();
        setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
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

    setState(DISCONNECTED);
  }, []);

  // Decide what a failed request means, by ERROR CODE (src/lib/connectErrors.ts).
  //   locked   → the session is ALIVE. Flag the lock, change nothing else, rethrow.
  //   teardown → the connection is genuinely gone. Drop everything.
  //   other    → a typed refusal the session survives. Surface it untouched.
  const handleRequestError = useCallback((err: unknown) => {
    const kind = classifyRequestError(err);

    if (kind === 'teardown') {
      transportRef.current?.destroy();
      clientRef.current = null;
      transportRef.current = null;
      popupRef.current = null;
      popupMode.current = false;
      sessionStorage.removeItem(SESSION_KEY_POPUP);
      // Preserve isWalletLocked: a codeless timeout raised WHILE the wallet is locked must not
      // erase the lock by assigning the whole DISCONNECTED constant over it.
      setState((s) => ({ ...DISCONNECTED, isWalletLocked: s.isWalletLocked }));
    } else if (kind === 'locked') {
      // WALLET_LOCKED (4009). Do NOT disconnect — the host preserved this session and will push
      // wallet:unlocked on it. The caller's promise still rejects: in Release 1 retrying is the
      // dApp's decision (Task 5's unlockEpoch), never a silent replay by this layer.
      setState((s) => ({ ...s, isWalletLocked: true }));
    }

    throw err;
  }, []);

  const query = useCallback(
    async <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>): Promise<T> => {
      const client = await ensureClient();
      try {
        return await client.query<T>(method, params);
      } catch (err) {
        return handleRequestError(err) as never;
      }
    },
    [ensureClient, handleRequestError],
  );

  const intent = useCallback(
    async <T = unknown>(action: IntentAction | string, params: Record<string, unknown>): Promise<T> => {
      const client = await ensureClient();
      try {
        return await client.intent<T>(action, params);
      } catch (err) {
        return handleRequestError(err) as never;
      }
    },
    [ensureClient, handleRequestError],
  );

  const on = useCallback((event: string, handler: (data: unknown) => void): (() => void) => {
    if (!clientRef.current) throw new Error('Not connected');
    return clientRef.current.on(event, handler);
  }, []);

  // Poll for popup window closure — reset connection state when detected.
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
        setState(DISCONNECTED);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isConnected]);

  // Handle wallet-initiated events auto-pushed by ConnectHost (no sphere_subscribe needed).
  // wallet:locked     → show locked state, wait for unlock.
  // identity:changed  → user switched address; update displayed identity.
  useEffect(() => {
    if (!state.isConnected || !clientRef.current) return;
    const client = clientRef.current;

    // wallet:locked — under Connect >= 2.1 this is a STATE, not a teardown: the session, the
    // granted permissions and the transport all survive, in EVERY transport mode. Tearing down
    // here orphans a host-side session that now outlives the lock, and the next silent
    // autoConnect reconnects with no prompt at all.
    //
    // A 2.0 wallet means the opposite by the same event name — the removed
    // notifyWalletLocked() pushed it AND revoked the session, so wallet:unlocked will never
    // arrive and there is nothing to wait for. ConnectClient.walletProtocol tells them apart.
    const unsubLocked = client.on(WALLET_EVENTS.LOCKED, () => {
      if (!supportsGracefulLock(client.walletProtocol)) {
        transportRef.current?.destroy();
        clientRef.current = null;
        transportRef.current = null;
        popupRef.current = null; // do NOT close the popup — the user may onboard another wallet there
        popupMode.current = false;
        sessionStorage.removeItem(SESSION_KEY_POPUP);
        setState(DISCONNECTED);
        return;
      }
      setState((s) => ({ ...s, isWalletLocked: true }));
    });

    // identity:changed — auto-pushed by ConnectHost (MetaMask accountsChanged pattern),
    // no sphere_subscribe needed. Update displayed identity when wallet switches address.
    const unsubIdentity = client.on(WALLET_EVENTS.IDENTITY_CHANGED, (data) => {
      setState((s) => ({ ...s, isWalletLocked: false, identity: data as PublicIdentity }));
    });

    return () => {
      unsubLocked();
      unsubIdentity();
    };
  }, [state.isConnected]);

  // On mount: try to restore connection automatically.
  // P1 (iframe): silent connect to parent Sphere window via PostMessage.
  // P2 (extension): silent check if origin is already approved.
  // P3 (popup): resume session if popup is still open.
  useEffect(() => {
    if (isInIframe()) {
      const silentCheck = async () => {
        // Wait up to 5s for Sphere to send HOST_READY_TYPE after ConnectHost is initialized.
        // Sphere sends it twice: immediately after onLoad AND 300ms later, so we are guaranteed
        // to catch at least the delayed send even if React effects weren't set up yet.
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
        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;
        const client = makeClient(transport, { silent: true });
        clientRef.current = client;
        try {
          const result = await client.connect();
          setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
        } catch {
          // Parent rejected (origin not approved yet) — clean up, show Connect button
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      };
      silentCheck().finally(() => setIsAutoConnecting(false));
      return;
    }

    if (hasExtension()) {
      const silentCheck = async () => {
        popupMode.current = false;
        const transport = ExtensionTransport.forClient();
        transportRef.current = transport;

        const client = makeClient(transport, { silent: true });
        clientRef.current = client;

        try {
          const result = await client.connect();
          setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
        } catch {
          // Origin not approved — clean up and show Connect button (no error message)
          transportRef.current?.destroy();
          clientRef.current = null;
          transportRef.current = null;
        }
      };

      silentCheck().finally(() => setIsAutoConnecting(false));
    } else {
      // Try popup session resume with a short timeout — if popup is alive, HOST_READY
      // arrives in <1s. If popup was closed/logged out, fail fast instead of waiting 30s.
      const savedSession = sessionStorage.getItem(SESSION_KEY_POPUP);
      if (savedSession) {
        popupMode.current = true;
        const resumePopup = async () => {
          if (!popupRef.current || popupRef.current.closed) {
            const popup = window.open(
              WALLET_URL + '/connect?origin=' + encodeURIComponent(location.origin),
              'sphere-wallet',
              'width=420,height=650',
            );
            if (!popup) throw new Error('Popup blocked');
            popupRef.current = popup;
          }

          transportRef.current?.destroy();
          const transport = PostMessageTransport.forClient({
            target: popupRef.current,
            targetOrigin: WALLET_URL,
          });
          transportRef.current = transport;

          await waitForHostReady(5000);

          const client = makeClient(transport, { resumeSessionId: savedSession, silent: true });
          clientRef.current = client;
          const result = await client.connect();
          sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId);
          setState({ ...DISCONNECTED, isConnected: true, identity: result.identity, permissions: result.permissions });
        };
        resumePopup()
          .catch(() => {
            sessionStorage.removeItem(SESSION_KEY_POPUP);
            transportRef.current?.destroy();
            clientRef.current = null;
            transportRef.current = null;
            popupRef.current = null;
            popupMode.current = false;
          })
          .finally(() => setIsAutoConnecting(false));
      } else {
        setIsAutoConnecting(false);
      }
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
