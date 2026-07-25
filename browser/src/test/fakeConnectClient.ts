/**
 * Test double for ConnectClient.
 *
 * useWalletConnect is the unit under test, so the SDK client is replaced wholesale:
 * connect() resolves immediately and the test drives auto-pushed wallet events with emit(),
 * exactly as ConnectHost.pushClientEvent would.
 *
 * It lives in its own module because a vi.mock factory is hoisted above the test file's own
 * declarations and therefore cannot close over them — the factory pulls this in with a
 * dynamic import instead.
 *
 * Deliberately has NO resubscribeAll(): the host re-arms suspended subscriptions itself in
 * updateSphere(), before it pushes wallet:unlocked. A client-side re-subscribe would mean a
 * dApp that never upgrades loses its event streams forever.
 */
import type { PublicIdentity } from '@unicitylabs/sphere-sdk/connect';

export const FAKE_IDENTITY: PublicIdentity = {
  chainPubkey: '02aaaa000000000000000000000000000000000000000000000000000000000000',
  directAddress: 'DIRECT://aaaa000000000000000000000000000000000000000000000000000000000000',
  nametag: 'alice',
};

/** A DIFFERENT wallet — what "Forgot password -> restore from recovery phrase" installs. */
export const OTHER_IDENTITY: PublicIdentity = {
  chainPubkey: '02bbbb000000000000000000000000000000000000000000000000000000000000',
  directAddress: 'DIRECT://bbbb000000000000000000000000000000000000000000000000000000000000',
  nametag: 'mallory',
};

export interface FakeClientOptions {
  transport: unknown;
  dapp: unknown;
  network?: unknown;
  resumeSessionId?: string;
  silent?: boolean;
}

export class FakeConnectClient {
  static instances: FakeConnectClient[] = [];
  static nextIdentity: PublicIdentity = FAKE_IDENTITY;
  static nextSessionId = 'session-1';
  /** Connect protocol version the wallet reports. '2.0' = legacy lock semantics. */
  static nextWalletProtocol = '2.1';
  /** ConnectResult.locked — a resume handshake that landed on a LOCKED but live wallet. */
  static nextLocked = false;

  static reset(): void {
    FakeConnectClient.instances = [];
    FakeConnectClient.nextIdentity = FAKE_IDENTITY;
    FakeConnectClient.nextSessionId = 'session-1';
    FakeConnectClient.nextWalletProtocol = '2.1';
    FakeConnectClient.nextLocked = false;
  }

  /** Never index the array directly — browser/tsconfig.json has noUncheckedIndexedAccess. */
  static get last(): FakeConnectClient {
    const last = FakeConnectClient.instances[FakeConnectClient.instances.length - 1];
    if (!last) throw new Error('No FakeConnectClient has been constructed');
    return last;
  }

  readonly options: FakeClientOptions;
  readonly queries: string[] = [];
  /** Every event name the hook registered a handler for, in order. */
  readonly onCalls: string[] = [];
  readonly walletProtocol: string;
  walletLocked: boolean;
  session: string | null = null;
  disconnectCalls = 0;
  queryResult: unknown = null;
  /** Set to make the next query()/intent() reject with this value. */
  queryError: unknown = null;

  private readonly handlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(options: FakeClientOptions) {
    this.options = options;
    this.walletProtocol = FakeConnectClient.nextWalletProtocol;
    this.walletLocked = FakeConnectClient.nextLocked;
    FakeConnectClient.instances.push(this);
  }

  async connect(): Promise<{
    sessionId: string;
    permissions: string[];
    identity: PublicIdentity;
    locked?: boolean;
  }> {
    this.session = FakeConnectClient.nextSessionId;
    return {
      sessionId: FakeConnectClient.nextSessionId,
      permissions: ['identity:read', 'balance:read'],
      identity: FakeConnectClient.nextIdentity,
      locked: FakeConnectClient.nextLocked,
    };
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.session = null;
  }

  async query<T>(method: string): Promise<T> {
    this.queries.push(method);
    if (this.queryError) throw this.queryError;
    return this.queryResult as T;
  }

  async intent<T>(action: string): Promise<T> {
    this.queries.push(action);
    if (this.queryError) throw this.queryError;
    return this.queryResult as T;
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    this.onCalls.push(event);
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /** Deliver an auto-pushed wallet event to every registered handler. */
  emit(event: string, data: unknown): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(data);
  }
}
