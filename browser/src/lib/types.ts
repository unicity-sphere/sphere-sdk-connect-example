export interface Asset {
  coinId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string | null;
  totalAmount: string;
  tokenCount: number;
  confirmedAmount: string;
  unconfirmedAmount: string;
  confirmedTokenCount: number;
  unconfirmedTokenCount: number;
  priceUsd: number | null;
  priceEur: number | null;
  change24h: number | null;
  fiatValueUsd: number | null;
  fiatValueEur: number | null;
}

export interface Token {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string;
  amount: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'transferring' | 'spent' | 'invalid';
  createdAt: number;
  updatedAt: number;
}

export interface L1Balance {
  confirmed: string;
  unconfirmed: string;
  vested: string;
  unvested: string;
  total: string;
}

export interface L1Transaction {
  txid: string;
  type: string;
  amount: string;
  fee: string;
  address?: string;
  confirmations?: number;
  timestamp: number;
  blockHeight?: number;
}

export interface HistoryEntry {
  id?: string;
  type: string;
  amount: string;
  coinId: string;
  symbol?: string;
  timestamp: number;
  recipientNametag?: string;
  senderPubkey?: string;
  senderNametag?: string;
  transferId?: string;
}

export interface PeerInfo {
  nametag?: string;
  chainPubkey?: string;
  l1Address?: string;
  directAddress?: string;
  transportPubkey?: string;
}

export interface DirectMessage {
  id: string;
  senderPubkey: string;
  senderNametag?: string;
  recipientPubkey: string;
  recipientNametag?: string;
  content: string;
  timestamp: number;
  isRead: boolean;
}

export interface ConversationSummary {
  peerPubkey: string;
  peerNametag?: string;
  lastMessage: DirectMessage;
  unreadCount: number;
  messageCount: number;
}

export interface ConversationPage {
  messages: DirectMessage[];
  hasMore: boolean;
  oldestTimestamp: number | null;
}

export type Section =
  | 'identity' | 'assets' | 'balance' | 'tokens' | 'history'
  | 'l1-balance' | 'l1-history' | 'resolve'
  | 'send' | 'l1-send' | 'dm' | 'payment-request' | 'receive' | 'sign-message'
  | 'chat'
  | 'events';
