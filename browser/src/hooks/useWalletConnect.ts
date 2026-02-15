import { useState, useRef, useCallback } from 'react';
import { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
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

const WALLET_URL = 'http://localhost:5173';

function isInIframe(): boolean {
  try {
    return window.parent !== window && window.self !== window.top;
  } catch {
    return true; // cross-origin iframe
  }
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

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));

    try {
      let transport: PostMessageTransport;

      if (isInIframe()) {
        transport = PostMessageTransport.forClient();
      } else {
        const popup = window.open(
          WALLET_URL + '/#/connect?origin=' + encodeURIComponent(location.origin),
          'sphere-wallet',
          'width=420,height=650',
        );
        if (!popup) {
          throw new Error('Popup blocked. Please allow popups for this site.');
        }
        popupRef.current = popup;
        transport = PostMessageTransport.forClient({
          target: popup,
          targetOrigin: WALLET_URL,
        });
      }

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
    } catch (err) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, []);

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
      if (!clientRef.current) throw new Error('Not connected');
      return clientRef.current.query<T>(method, params);
    },
    [],
  );

  const intent = useCallback(
    async <T = unknown>(action: IntentAction | string, params: Record<string, unknown>): Promise<T> => {
      if (!clientRef.current) throw new Error('Not connected');
      return clientRef.current.intent<T>(action, params);
    },
    [],
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
