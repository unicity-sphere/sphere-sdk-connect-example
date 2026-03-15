/**
 * useAutoConnect — Simplified wallet connection hook using SDK's autoConnect().
 *
 * Replaces the manual transport detection logic in useWalletConnect.ts
 * with a single autoConnect() call that handles iframe/extension/popup automatically.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { autoConnect, isInIframe, hasExtension } from '@unicitylabs/sphere-sdk/connect/browser';
import type { AutoConnectResult, DetectedTransport } from '@unicitylabs/sphere-sdk/connect/browser';
import type { PublicIdentity, RpcMethod, IntentAction, PermissionScope } from '@unicitylabs/sphere-sdk/connect';

export interface UseAutoConnectState {
  isConnected: boolean;
  isConnecting: boolean;
  identity: PublicIdentity | null;
  permissions: readonly PermissionScope[];
  error: string | null;
}

export interface UseAutoConnect extends UseAutoConnectState {
  /** Connect using auto-detected transport (iframe → extension → popup). */
  connect: () => Promise<void>;
  /** Force connect via extension transport. */
  connectViaExtension: () => Promise<void>;
  /** Force connect via popup transport. */
  connectViaPopup: () => Promise<void>;
  disconnect: () => Promise<void>;
  query: <T = unknown>(method: RpcMethod | string, params?: Record<string, unknown>) => Promise<T>;
  intent: <T = unknown>(action: IntentAction | string, params: Record<string, unknown>) => Promise<T>;
  on: (event: string, handler: (data: unknown) => void) => () => void;
  /** True during initial silent check — hides Connect button to avoid flash. */
  isAutoConnecting: boolean;
  /** True if Sphere browser extension is detected. */
  extensionInstalled: boolean;
  /** Which transport was used for the current connection. */
  transportType: DetectedTransport | null;
}

const WALLET_URL = import.meta.env.VITE_WALLET_URL || 'https://sphere.unicity.network';

const DAPP_META = {
  name: 'Connect Demo',
  description: 'Sphere Connect browser example',
  url: typeof location !== 'undefined' ? location.origin : '',
} as const;

export function useAutoConnect(): UseAutoConnect {
  // Silent auto-connect for iframe (host is always present) and extension
  // (background service worker is always running and can check approved origins).
  const willSilentCheck = isInIframe() || hasExtension();

  const [isAutoConnecting, setIsAutoConnecting] = useState(willSilentCheck);
  const [state, setState] = useState<UseAutoConnectState>({
    isConnected: false,
    isConnecting: false,
    identity: null,
    permissions: [],
    error: null,
  });
  const [transportType, setTransportType] = useState<DetectedTransport | null>(null);

  const resultRef = useRef<AutoConnectResult | null>(null);

  const doConnect = useCallback(async (forceTransport?: DetectedTransport, silent?: boolean) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      const result = await autoConnect({
        dapp: DAPP_META,
        walletUrl: WALLET_URL,
        forceTransport,
        silent,
      });

      resultRef.current = result;
      setTransportType(result.transport);
      setState({
        isConnected: true,
        isConnecting: false,
        identity: result.connection.identity,
        permissions: result.connection.permissions,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      // Improve error message for extension when wallet is not open
      const isWalletClosed = message.includes('not open') || message.includes('timeout') || message.includes('Timeout');
      const displayError = isWalletClosed && forceTransport === 'extension'
        ? 'Sphere wallet is not open. Click the Sphere extension icon first, then try again.'
        : message;

      setState((s) => ({
        ...s,
        isConnecting: false,
        error: silent ? null : displayError,
      }));
    }
  }, []);

  const connect = useCallback(async () => {
    await doConnect();
  }, [doConnect]);

  const connectViaExtension = useCallback(async () => {
    // Ask extension to open/focus the wallet window
    window.postMessage({ type: 'sphere-open-wallet' }, '*');
    // Wait for wallet to load and ConnectHost to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await doConnect('extension');
  }, [doConnect]);

  const connectViaPopup = useCallback(async () => {
    if (isInIframe()) {
      await doConnect('iframe');
    } else {
      await doConnect('popup');
    }
  }, [doConnect]);

  const disconnect = useCallback(async () => {
    if (resultRef.current) {
      await resultRef.current.disconnect();
      resultRef.current = null;
    }
    setTransportType(null);
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
      if (!resultRef.current) throw new Error('Not connected');
      return resultRef.current.client.query<T>(method, params);
    },
    [],
  );

  const intent = useCallback(
    async <T = unknown>(action: IntentAction | string, params: Record<string, unknown>): Promise<T> => {
      if (!resultRef.current) throw new Error('Not connected');
      return resultRef.current.client.intent<T>(action, params);
    },
    [],
  );

  const on = useCallback((event: string, handler: (data: unknown) => void): (() => void) => {
    if (!resultRef.current) throw new Error('Not connected');
    return resultRef.current.client.on(event, handler);
  }, []);

  // Silent auto-connect on mount (iframe or extension only)
  useEffect(() => {
    if (!willSilentCheck) return;

    doConnect(undefined, true)
      .catch(() => {
        // Silent check failed — that's OK, user will click Connect
      })
      .finally(() => setIsAutoConnecting(false));
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
    transportType,
  };
}
