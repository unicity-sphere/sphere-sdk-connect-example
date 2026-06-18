import { useState, useEffect, useRef, useCallback } from 'react';
import { RPC_METHODS, INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input } from '@unicitylabs/sphere-ui';
import { chatTime, truncate } from '../../lib/format';
import type { ConversationSummary, ConversationPage, DirectMessage } from '../../lib/types';

interface Props {
  query: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
  on: (event: string, handler: (data: unknown) => void) => () => void;
  walletPubkey: string;
}

export function ChatPanel({ query, intent, on, walletPubkey }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [oldestTs, setOldestTs] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newChatRecipient, setNewChatRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  // Local cache: pubkey → nametag (persists within session even if wallet doesn't return it)
  const nametagCache = useRef<Map<string, string>>(new Map());

  // Cache nametags from any source
  const cacheNametag = useCallback((pubkey: string, nametag: string | undefined) => {
    if (nametag && pubkey) nametagCache.current.set(pubkey, nametag);
  }, []);

  const getNametag = useCallback((pubkey: string): string | undefined => {
    return nametagCache.current.get(pubkey);
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const result = await query<ConversationSummary[]>(RPC_METHODS.GET_CONVERSATIONS);
      // Cache nametags from conversations
      for (const c of result) {
        cacheNametag(c.peerPubkey, c.peerNametag);
      }
      setConversations(result);
    } catch {
      // dm:read permission may not be granted
    }
  }, [query, cacheNametag]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages for selected peer
  const loadMessages = useCallback(async (peerPubkey: string) => {
    setLoading(true);
    try {
      const result = await query<ConversationPage>(RPC_METHODS.GET_MESSAGES, {
        peerPubkey,
        limit: 30,
      });
      // Cache nametags from messages
      for (const m of result.messages) {
        if (m.senderPubkey !== walletPubkey) cacheNametag(m.senderPubkey, m.senderNametag);
        if (m.recipientPubkey !== walletPubkey) cacheNametag(m.recipientPubkey, m.recipientNametag);
      }
      setMessages(result.messages);
      setHasMore(result.hasMore);
      setOldestTs(result.oldestTimestamp);

      // Mark unread messages as read
      const unread = result.messages.filter((m) => !m.isRead && m.senderPubkey !== walletPubkey);
      if (unread.length > 0) {
        query(RPC_METHODS.MARK_AS_READ, { messageIds: unread.map((m) => m.id) }).catch(() => {});
        loadConversations();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [query, walletPubkey, loadConversations, cacheNametag]);

  // Select conversation
  const selectPeer = useCallback((pubkey: string) => {
    setSelectedPeer(pubkey);
    setMessages([]);
    setError(null);
    loadMessages(pubkey);
  }, [loadMessages]);

  // Load older messages
  const loadOlder = async () => {
    if (!selectedPeer || !hasMore || !oldestTs) return;
    try {
      const result = await query<ConversationPage>(RPC_METHODS.GET_MESSAGES, {
        peerPubkey: selectedPeer,
        limit: 20,
        before: oldestTs,
      });
      setMessages((prev) => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
      setOldestTs(result.oldestTimestamp);
    } catch {}
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    // Try: conversation data → local cache → raw pubkey
    const peerNametag = selectedPeer
      ? (conversations.find((c) => c.peerPubkey === selectedPeer)?.peerNametag ?? getNametag(selectedPeer))
      : null;
    const to = peerNametag
      ? (peerNametag.startsWith('@') ? peerNametag : '@' + peerNametag)
      : selectedPeer
        ? selectedPeer  // raw pubkey — send without @
        : newChatRecipient.startsWith('@') ? newChatRecipient : '@' + newChatRecipient;
    if (!to) return;

    setSending(true);
    setError(null);
    try {
      const result = await intent<{ sent: boolean; messageId?: string; timestamp?: number }>(
        INTENT_ACTIONS.DM,
        { to, message: input.trim() },
      );
      if (result.sent) {
        setInput('');
        // If we started a new chat, reload conversations and select the new peer
        if (!selectedPeer && newChatRecipient) {
          setNewChatRecipient('');
          await loadConversations();
        }
        // Reload messages for current peer
        if (selectedPeer) {
          await loadMessages(selectedPeer);
        }
        await loadConversations();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // Real-time incoming DMs
  useEffect(() => {
    const unsub = on('message:dm', (data) => {
      const dm = data as DirectMessage;
      // Cache nametags from real-time messages
      if (dm.senderPubkey !== walletPubkey) cacheNametag(dm.senderPubkey, dm.senderNametag);
      if (dm.recipientPubkey !== walletPubkey) cacheNametag(dm.recipientPubkey, dm.recipientNametag);
      // Update message thread if from/to selected peer
      if (selectedPeer && (dm.senderPubkey === selectedPeer || dm.recipientPubkey === selectedPeer)) {
        setMessages((prev) => [...prev, dm]);
        // Mark as read since we're viewing
        query(RPC_METHODS.MARK_AS_READ, { messageIds: [dm.id] }).catch(() => {});
      }
      // Refresh conversation list
      loadConversations();
    });
    return unsub;
  }, [on, selectedPeer, query, walletPubkey, loadConversations, cacheNametag]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedConvo = conversations.find((c) => c.peerPubkey === selectedPeer);
  const selectedNametag = selectedConvo?.peerNametag ?? (selectedPeer ? getNametag(selectedPeer) : undefined);
  const peerDisplay = selectedNametag
    ? `@${selectedNametag}`
    : selectedPeer
      ? truncate(selectedPeer)
      : null;

  return (
    <div className="admin-card overflow-hidden" style={{ height: '600px' }}>
      <div className="flex h-full">
        {/* Conversation list */}
        <div className="w-56 shrink-0 border-r border-white/8 flex flex-col">
          <div className="p-3 border-b border-white/8">
            <h2 className="text-sm font-semibold text-white">Chats</h2>
          </div>

          {/* New chat input */}
          <div className="p-2 border-b border-white/8">
            <Input
              type="text"
              value={newChatRecipient}
              onChange={(e) => setNewChatRecipient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newChatRecipient.trim()) {
                  setSelectedPeer(null);
                  setMessages([]);
                }
              }}
              placeholder="New chat (@nametag)"
              className="w-full text-xs"
            />
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <div className="p-4 text-xs text-white/45 text-center">No conversations yet</div>
            )}
            {conversations.map((convo) => (
              <button
                key={convo.peerPubkey}
                onClick={() => selectPeer(convo.peerPubkey)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/8 cursor-pointer transition-colors ${
                  selectedPeer === convo.peerPubkey
                    ? 'bg-orange-500/10'
                    : 'hover:bg-white/3'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-white truncate">
                    {(convo.peerNametag || getNametag(convo.peerPubkey)) ? `@${convo.peerNametag || getNametag(convo.peerPubkey)}` : truncate(convo.peerPubkey)}
                  </span>
                  {convo.unreadCount > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                      {convo.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45 truncate max-w-[120px]">
                    {convo.lastMessage.content}
                  </span>
                  <span className="text-[10px] text-white/45 shrink-0 ml-1">
                    {chatTime(convo.lastMessage.timestamp)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Thread header */}
          <div className="px-4 py-3 border-b border-white/8 bg-white/3">
            {peerDisplay ? (
              <span className="text-sm font-semibold text-white">{peerDisplay}</span>
            ) : newChatRecipient ? (
              <span className="text-sm font-semibold text-white">
                New chat with {newChatRecipient.startsWith('@') ? newChatRecipient : '@' + newChatRecipient}
              </span>
            ) : (
              <span className="text-sm text-white/45">Select a conversation or start a new chat</span>
            )}
          </div>

          {/* Messages */}
          <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {hasMore && (
              <button
                onClick={loadOlder}
                className="w-full text-xs text-orange-500 hover:text-orange-400 py-1 cursor-pointer"
              >
                Load older messages
              </button>
            )}

            {loading && messages.length === 0 && (
              <div className="text-xs text-white/45 text-center py-8">Loading messages...</div>
            )}

            {!selectedPeer && !newChatRecipient && messages.length === 0 && !loading && (
              <div className="text-xs text-white/45 text-center py-8">
                Select a conversation from the list or type a @nametag to start a new chat
              </div>
            )}

            {messages.map((msg) => {
              const isOwn = msg.senderPubkey === walletPubkey;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                      isOwn
                        ? 'bg-orange-500 text-white rounded-br-md'
                        : 'bg-white/6 text-white rounded-bl-md'
                    }`}
                  >
                    {!isOwn && msg.senderNametag && (
                      <div className="text-[10px] font-medium text-orange-400 mb-0.5">
                        @{msg.senderNametag}
                      </div>
                    )}
                    <div className="text-sm break-words">{msg.content}</div>
                    <div className={`text-[10px] mt-0.5 ${isOwn ? 'text-orange-200' : 'text-white/45'}`}>
                      {chatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-1.5 text-xs text-red-500 bg-red-500/10 border-t border-red-500/20">
              {error}
            </div>
          )}

          {/* Input */}
          {(selectedPeer || newChatRecipient) && (
            <div className="px-3 py-2.5 border-t border-white/8 flex gap-2">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
              >
                {sending ? '...' : 'Send'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
