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
  /** A lock ended with a DIFFERENT wallet than this session was approved for. Unlock is not
   *  implicitly the same wallet: the lock screen's "restore from recovery phrase" installs
   *  another seed, and origin approvals carry no identity binding. */
  walletChanged: boolean;
  /** Bumps once per unlock that returned the SAME wallet. Read panels use it as a refetch
   *  trigger — the reference retry-after-unlock. Never used to replay an intent. */
  unlockEpoch: number;
  /** Connect protocol version the WALLET reported at handshake ('2.1', '2.0', …), or null.
   *  Decides what wallet:locked means — see src/lib/walletProtocol.ts. */
  walletProtocol: string | null;
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
  /** Raise the wallet window (popup mode only). Returns false when there is none to raise. */
  focusWallet: () => boolean;
}

// Reusable disconnected state so no call site has to remember every flag
const DISCONNECTED: WalletConnectState = {
  isConnected: false,
  isConnecting: false,
  isWalletLocked: false,
  walletChanged: false,
  unlockEpoch: 0,
  walletProtocol: null,
  identity: null,
  permissions: [],
  error: null,
};

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

// sessionStorage key for popup session resume (P3 only)
const SESSION_KEY_POPUP = 'sphere-connect-popup-session';

/**
 * The popup's window NAME. `window.open(url, name)` does not merely return an existing window
 * with that name — it NAVIGATES it to `url`. Navigating the wallet reloads its page, and the
 * password is memory-only, so that RELOCKS the wallet. Reloading the dApp was enough to trigger
 * it: the fresh JS context has lost its window handle, so the reconnect called window.open with
 * a URL and re-navigated a perfectly good wallet window.
 *
 * `window.open('', name)` returns the existing window WITHOUT navigating it — that is how a
 * handle is recovered. When no such window exists it yields a blank one instead, which is then
 * navigated properly.
 */
const POPUP_NAME = 'sphere-wallet';
const POPUP_FEATURES = 'width=420,height=650';

function walletConnectUrl(): string {
  return WALLET_URL + '/connect?origin=' + encodeURIComponent(location.origin);
}

/** A saved session id means a wallet window was serving us — worth trying to recover. */
function popupSessionId(): string | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_KEY_POPUP);
}

const DAPP_META = {
  name: 'Connect Demo',
  description: 'Sphere Connect browser example',
  url: location.origin,
} as const;

/**
 * Is there a live user gesture behind the call happening right now?
 *
 * `navigator.userActivation.isActive` is the browser's own transient-activation flag: true for
 * a short window after a real click/keypress, false for anything a timer or a subscription
 * callback started. It is what separates "the user pressed Fetch Balance" from "a poller ran",
 * so it decides whether we may raise the wallet window. Absent (non-Chromium) -> treated as
 * NOT user-initiated, because guessing wrong in that direction only costs a window raise,
 * while guessing wrong the other way lets a background timer steal focus.
 */
function isUserInitiated(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation;
  return activation?.isActive ?? false;
}

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
  // Mirrors state.identity so the auto-pushed event handlers — registered once per connection —
  // compare against the CURRENT identity instead of a stale closure copy.
  const identityRef = useRef<PublicIdentity | null>(null);
  useEffect(() => {
    identityRef.current = state.identity;
  }, [state.identity]);
  // Mirrors state.isConnected for the always-armed HOST_READY listener, which is registered
  // once and must not be torn down and rebuilt every time the connection state flips.
  const isConnectedRef = useRef(false);
  useEffect(() => {
    isConnectedRef.current = state.isConnected;
  }, [state.isConnected]);
  // True while a popup connect attempt is running. The attempt CONSUMES the announcement
  // itself (waitForHostReady), so the listener must stand aside or it would race the attempt
  // and build a second client for the same handshake. Written SYNCHRONOUSLY rather than
  // mirrored from state through an effect: the announcement can arrive in the same tick the
  // attempt starts, long before React has flushed anything.
  const attemptInFlightRef = useRef(false);

  const makeClient = useCallback(
    (transport: ConnectTransport, extra: { resumeSessionId?: string; silent?: boolean } = {}): ConnectClient =>
      new ConnectClient({ transport, dapp: DAPP_META, network: SPHERE_NETWORKS.testnet2, ...extra }),
    [],
  );

  /**
   * Handshake on `transport` and publish the result. The single place a session is created —
   * seven call sites used to repeat this block, which is why the wallet's protocol version and
   * the new ConnectResult.locked had nowhere to be recorded.
   *
   * `result.locked === true` means the wallet was LOCKED when we resumed and the session is
   * nevertheless alive: connected AND locked, in one state. That is a success, not a refusal.
   */
  const handshake = useCallback(
    async (transport: ConnectTransport, extra: { resumeSessionId?: string; silent?: boolean } = {}) => {
      const client = makeClient(transport, extra);
      clientRef.current = client;
      const result = await client.connect();
      if (popupMode.current) sessionStorage.setItem(SESSION_KEY_POPUP, result.sessionId);
      setState({
        ...DISCONNECTED,
        isConnected: true,
        isWalletLocked: result.locked === true,
        identity: result.identity,
        permissions: result.permissions,
        walletProtocol: client.walletProtocol,
      });
      return result;
    },
    [makeClient],
  );

  const rehandshaking = useRef(false);

  /**
   * The wallet host announced HOST_READY while we already believed we were connected — the
   * wallet page reloaded (a reload during a lock does exactly this) and the old ConnectHost is
   * gone. Rebuild the transport and resume the SAME session id silently: the persisted origin
   * approval survives a reload, so the user must not see a consent prompt for it. If the
   * wallet is still locked, the resume succeeds with locked: true.
   *
   * Extension mode never receives HOST_READY — only the PostMessage host sends it — so this is
   * a no-op there by construction.
   */
  const rehandshake = useCallback(async () => {
    if (rehandshaking.current) return;
    rehandshaking.current = true;
    try {
      const wasPopup = popupMode.current;
      if (!wasPopup && !isInIframe()) return;
      if (wasPopup && (!popupRef.current || popupRef.current.closed)) return;

      transportRef.current?.destroy();
      const transport = wasPopup
        ? PostMessageTransport.forClient({ target: popupRef.current!, targetOrigin: WALLET_URL })
        : PostMessageTransport.forClient();
      transportRef.current = transport;

      const resumeSessionId = wasPopup ? sessionStorage.getItem(SESSION_KEY_POPUP) ?? undefined : undefined;
      await handshake(transport, { resumeSessionId, silent: true });
    } catch {
      // The host came back without a resumable session — leave the state alone; the user
      // reconnects explicitly. Never surface an error for a background re-handshake.
    } finally {
      rehandshaking.current = false;
    }
  }, [handshake]);

  /**
   * A connect attempt failed while the wallet was locked, and the wallet has just announced
   * that it can serve again. Retry it — the user already asked to connect; making them press
   * Connect a second time for a wallet that is now ready is the bug this closes.
   *
   * Silent is deliberately NOT set: if this origin has no approval yet the user must still
   * see the consent prompt. What is skipped is only the second CLICK, never the consent.
   */
  const retryAfterUnlock = useCallback(async () => {
    if (rehandshaking.current) return;
    rehandshaking.current = true;
    try {
      const popup = popupRef.current;
      if (!popup || popup.closed) return;
      transportRef.current?.destroy();
      const transport = PostMessageTransport.forClient({ target: popup, targetOrigin: WALLET_URL });
      transportRef.current = transport;
      const resumeSessionId = sessionStorage.getItem(SESSION_KEY_POPUP) ?? undefined;
      await handshake(transport, { resumeSessionId });
    } catch {
      // Still not ready, or the user declined. Leave the state alone — the next announcement
      // (or an explicit click) tries again.
    } finally {
      rehandshaking.current = false;
    }
  }, [handshake]);

  // Permanent HOST_READY listener, replacing the one-shot mount listener. ALWAYS armed —
  // never gated on isConnected.
  //
  // The wallet announces HOST_READY at each moment its host becomes able to complete a
  // handshake, and a wallet that cold-starts LOCKED announces nothing until a human unlocks
  // it. That announcement is therefore the signal that a connect attempt which failed while
  // the wallet was locked can now succeed. Gating this listener on isConnected swallowed it:
  // the attempt had already failed, so nothing was listening, and the user was left pressing
  // Connect against a wallet that was ready — the reported bug.
  //
  //   connected     -> the wallet page restarted; resume the SAME session silently.
  //   not connected -> a previous attempt failed against a locked wallet; the unlock is our
  //                    cue to retry it, with no second click.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== HOST_READY_TYPE) return;
      // An attempt in flight is already waiting for exactly this message.
      if (attemptInFlightRef.current) return;
      if (isConnectedRef.current) {
        void rehandshake();
        return;
      }
      // Only for a popup we still hold: an announcement can only come from a host we opened.
      if (!popupMode.current || !popupRef.current || popupRef.current.closed) return;
      void retryAfterUnlock();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [rehandshake, retryAfterUnlock]);

  /**
   * Open (or re-open) popup, create fresh transport + client, do handshake.
   * Wallet remembers approved origin so re-connect skips the approval modal.
   */
  const openPopupAndConnect = useCallback(async (): Promise<ConnectClient> => {
    attemptInFlightRef.current = true;
    try {
    // Whether THIS call created the window decides whether we wait for HOST_READY.
    let openedFreshWindow = false;
    if (!popupRef.current || popupRef.current.closed) {
      // Recover a handle to an already-open wallet window WITHOUT navigating it — see
      // POPUP_NAME. Only if there is nothing to recover do we navigate, which is what actually
      // loads (or reloads) the wallet page.
      const existing = window.open('', POPUP_NAME, POPUP_FEATURES);
      const looksReusable = !!existing && !existing.closed && !!popupSessionId();
      if (looksReusable) {
        popupRef.current = existing;
      } else {
        const popup = window.open(walletConnectUrl(), POPUP_NAME, POPUP_FEATURES);
        if (!popup) {
          throw new Error('Popup blocked. Please allow popups for this site.');
        }
        popupRef.current = popup;
        openedFreshWindow = true;
      }
    } else {
      popupRef.current.focus();
    }

    transportRef.current?.destroy();
    const transport = PostMessageTransport.forClient({
      target: popupRef.current,
      targetOrigin: WALLET_URL,
    });
    transportRef.current = transport;

    // HOST_READY is announced ONCE per host, at the moment that host becomes able to serve a
    // handshake. It is the right thing to wait for while a wallet page is still booting — and
    // the wrong thing to wait for against a window that has already booted and already
    // announced, which is why a second Connect used to hang for the full timeout.
    //
    // Deliberately NOT remembered as a "host is ready" flag: readiness is not monotonic (a
    // wallet can lock again with no wire signal at all), so a remembered bit goes stale with
    // nothing to clear it. Instead the handshake is simply attempted; a host that cannot
    // serve refuses it promptly, and the always-armed listener above retries when the wallet
    // announces it can.
    if (openedFreshWindow) await waitForHostReady();

    const resumeSessionId = sessionStorage.getItem(SESSION_KEY_POPUP) ?? undefined;
    await handshake(transport, { resumeSessionId });

    return clientRef.current!;
    } finally {
      attemptInFlightRef.current = false;
    }
  }, [handshake]);

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
      await handshake(transport);
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [handshake]);

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
        await handshake(transport);
      } else {
        // Outside iframe — open popup window
        popupMode.current = true;
        await openPopupAndConnect();
      }
    } catch (err) {
      setState((s) => ({ ...s, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }));
    }
  }, [openPopupAndConnect, handshake]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      if (isInIframe()) {
        // P1: embedded inside Sphere iframe — talk to parent window directly
        // No waitForHostReady() — ConnectHost is already created by the time user clicks
        popupMode.current = false;

        const transport = PostMessageTransport.forClient();
        transportRef.current = transport;

        await handshake(transport);
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
  }, [connectViaExtension, connectViaPopup, handshake]);

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

  /**
   * Bring the wallet window to the front. Returns false when there is nothing to raise.
   *
   * Call this ONLY from a user gesture — a button, never a failed background request. A page
   * that yanked focus on its own would be a nuisance at best and a clickjacking aid at worst.
   *
   * It deliberately does NOT reopen a CLOSED popup. Closing the popup is a real disconnect:
   * the wallet revokes the session on beforeunload and pushes wallet:disconnected, and a
   * fresh window would cold-start LOCKED anyway because the password is memory-only. Offering
   * to "restore" it would be a lie — the honest move is to reconnect explicitly.
   */
  const focusWallet = useCallback((): boolean => {
    const popup = popupRef.current;
    if (!popupMode.current || !popup || popup.closed) return false;
    popup.focus();
    return true;
  }, []);

  /**
   * Raise the wallet window when a request was refused BECAUSE the wallet is locked and a
   * human is the one who asked. `userAsked` is sampled synchronously at the call site, before
   * any await, so a background poller can never trigger this — only a live gesture can.
   *
   * This is the difference between a helpful reaction and a hostile one: raising the window
   * the user just asked to talk to is what a wallet integration should do, whereas a page
   * that grabs focus on a timer is a nuisance and an aid to clickjacking. The wallet still
   * decides everything that happens next — it raises its own password field, we only make the
   * window visible.
   */
  const raiseWalletIfUserAsked = useCallback((err: unknown, userAsked: boolean): void => {
    if (!userAsked) return;
    if (classifyRequestError(err) !== 'locked') return;
    focusWallet();
  }, [focusWallet]);

  const query = useCallback(
    async <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>): Promise<T> => {
      // Sampled SYNCHRONOUSLY, before any await: this is the only moment at which the user's
      // gesture is still live. See raiseWalletIfUserAsked.
      const userAsked = isUserInitiated();
      const client = await ensureClient();
      try {
        return await client.query<T>(method, params);
      } catch (err) {
        raiseWalletIfUserAsked(err, userAsked);
        return handleRequestError(err) as never;
      }
    },
    [ensureClient, handleRequestError, raiseWalletIfUserAsked],
  );

  const intent = useCallback(
    async <T = unknown>(action: IntentAction | string, params: Record<string, unknown>): Promise<T> => {
      const userAsked = isUserInitiated();
      const client = await ensureClient();
      try {
        return await client.intent<T>(action, params);
      } catch (err) {
        raiseWalletIfUserAsked(err, userAsked);
        return handleRequestError(err) as never;
      }
    },
    [ensureClient, handleRequestError, raiseWalletIfUserAsked],
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

    // wallet:unlocked — the SAME session continues: no re-handshake, no re-approval, and no
    // re-subscribe (the host replays every suspended subscription key BEFORE it pushes this).
    // The payload carries the wallet's identity at unlock time, and checking it is not
    // optional: the host's lock-edge guard is authoritative, but a dApp must render honestly.
    const unsubUnlocked = client.on(WALLET_EVENTS.UNLOCKED, (data) => {
      const next = (data as { identity?: PublicIdentity } | undefined)?.identity ?? null;
      const previous = identityRef.current;
      const sameWallet = !!next && !!previous && next.chainPubkey === previous.chainPubkey;

      if (!sameWallet) {
        // A different seed came back (or none was reported). Resume NOTHING against it — the
        // origin approval that authorises this session says nothing about which wallet it is.
        setState((s) => ({ ...s, isWalletLocked: false, walletChanged: true, identity: next ?? s.identity }));
        return;
      }

      setState((s) => ({ ...s, isWalletLocked: false, walletChanged: false, unlockEpoch: s.unlockEpoch + 1 }));
    });

    // wallet:disconnected — logout, wallet deleted, a session that expired while locked, or a
    // different seed behind the lock screen. Unlike a lock this really is a teardown: nothing
    // is resumable without a fresh handshake.
    const unsubDisconnected = client.on(WALLET_EVENTS.DISCONNECTED, () => {
      transportRef.current?.destroy();
      clientRef.current = null;
      transportRef.current = null;
      popupRef.current = null; // do NOT close the popup — the user may onboard a new wallet there
      popupMode.current = false;
      sessionStorage.removeItem(SESSION_KEY_POPUP);
      setState(DISCONNECTED);
    });

    // identity:changed — auto-pushed by ConnectHost (MetaMask accountsChanged pattern),
    // no sphere_subscribe needed. Update displayed identity when wallet switches address.
    // identity:changed — the user switched address inside an UNLOCKED wallet. Not a lock event:
    // it clears both flags because the wallet is demonstrably usable and freshly identified.
    const unsubIdentity = client.on(WALLET_EVENTS.IDENTITY_CHANGED, (data) => {
      setState((s) => ({ ...s, isWalletLocked: false, walletChanged: false, identity: data as PublicIdentity }));
    });

    return () => {
      unsubLocked();
      unsubUnlocked();
      unsubDisconnected();
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
        try {
          await handshake(transport, { silent: true });
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

        try {
          await handshake(transport, { silent: true });
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
          // THIS is the path a dApp page reload takes, and it must not navigate the wallet
          // window: navigating reloads the wallet page, and the memory-only password dies with
          // it, so merely reloading the dApp relocked the wallet. Recover the handle instead.
          const existing =
            popupRef.current && !popupRef.current.closed
              ? popupRef.current
              : window.open('', POPUP_NAME, POPUP_FEATURES);

          if (existing && !existing.closed) {
            popupRef.current = existing;
            transportRef.current?.destroy();
            const transport = PostMessageTransport.forClient({
              target: existing,
              targetOrigin: WALLET_URL,
            });
            transportRef.current = transport;
            try {
              // No waitForHostReady: a host that is already live announced once, when it came
              // up, and does not announce again. Just resume — a live wallet answers at once.
              await handshake(transport, { resumeSessionId: savedSession, silent: true });
              return;
            } catch {
              // Either that window is not a live wallet (window.open('') hands back a blank one
              // when the name is free) or the session is gone. Fall through and load the wallet
              // into the very same window rather than leaving a stray blank popup behind.
            }
          }

          const popup = window.open(walletConnectUrl(), POPUP_NAME, POPUP_FEATURES);
          if (!popup) throw new Error('Popup blocked');
          popupRef.current = popup;

          transportRef.current?.destroy();
          const transport = PostMessageTransport.forClient({
            target: popup,
            targetOrigin: WALLET_URL,
          });
          transportRef.current = transport;

          await waitForHostReady(5000);
          await handshake(transport, { resumeSessionId: savedSession, silent: true });
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
    focusWallet,
  };
}
