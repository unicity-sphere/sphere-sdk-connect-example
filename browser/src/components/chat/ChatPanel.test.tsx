/**
 * The 4201 lock in a panel that has more than one thing to lock.
 *
 * Every other intent panel owns exactly one action, so a panel-scoped `sendFailure` is the same
 * thing as an action-scoped one. Chat is not: an unresolved `dm` to Alice says nothing about a
 * `dm` to Bob, which was never sent and has nothing to reconcile. A panel-scoped lock would keep
 * Bob's composer disabled and show him a banner telling him to reload Alice's conversation.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectError, ERROR_CODES, RPC_METHODS } from '@unicitylabs/sphere-sdk/connect';
import { ChatPanel } from './ChatPanel';
import type { ConversationSummary } from '../../lib/types';

// jsdom implements no layout, so it has no scrollIntoView; the panel auto-scrolls on every
// message change. Stubbing it is a test-environment detail, not a claim about the component.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const ME = '02'.repeat(33);
const ALICE = '03'.repeat(33);
const BOB = '04'.repeat(33);

function conversation(peerPubkey: string, peerNametag: string): ConversationSummary {
  return {
    peerPubkey,
    peerNametag,
    lastMessage: {
      id: `m-${peerNametag}`,
      senderPubkey: peerPubkey,
      recipientPubkey: ME,
      content: 'hi',
      timestamp: 1_700_000_000_000,
      isRead: true,
    },
    unreadCount: 0,
    messageCount: 1,
  };
}

/** `intent()` rejects the FIRST dm with 4201 and resolves every later one. */
function renderPanel() {
  const sent: Record<string, unknown>[] = [];
  const query = async <T,>(method: string): Promise<T> => {
    if (method === RPC_METHODS.GET_CONVERSATIONS) {
      return [conversation(ALICE, 'alice'), conversation(BOB, 'bob')] as T;
    }
    return { messages: [], hasMore: false, oldestTimestamp: null } as T;
  };
  const intent = async <T,>(_action: string, params: Record<string, unknown>): Promise<T> => {
    sent.push(params);
    if (sent.length === 1) {
      throw new ConnectError('Intent outcome unknown', ERROR_CODES.INTENT_OUTCOME_UNKNOWN);
    }
    return { sent: true, messageId: `msg-${sent.length}` } as T;
  };
  render(
    <ChatPanel query={query} intent={intent} on={() => () => {}} walletPubkey={ME}
      isWalletLocked={false} unlockEpoch={0} />,
  );
  return { sent };
}

const composer = () => screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
const sendButton = () => screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

async function openThread(nametag: string) {
  fireEvent.click(await screen.findByText(`@${nametag}`, { selector: 'span.font-medium' }));
  await waitFor(() => expect(composer()).toBeTruthy());
}

async function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

describe('ChatPanel 4201 lock', () => {
  it('locks only the thread whose dm went unresolved', async () => {
    const { sent } = renderPanel();

    await openThread('alice');
    await type('for alice');
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    // The banner names Alice's conversation, not "the conversation".
    expect(screen.getByText(/Reload the conversation with @alice/)).toBeTruthy();

    // Bob's composer is untouched: nothing was sent to him, so there is nothing to reconcile.
    await openThread('bob');
    await waitFor(() => expect(screen.queryByText(/Outcome unknown/)).toBeNull());
    await type('for bob');
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
    await waitFor(() => expect(sent).toHaveLength(2));
  });

  it('restores the lock when the unresolved thread is opened again', async () => {
    const { sent } = renderPanel();

    await openThread('alice');
    await type('for alice');
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    await openThread('bob');
    await waitFor(() => expect(screen.queryByText(/Outcome unknown/)).toBeNull());

    await openThread('alice');
    await waitFor(() => expect(screen.getByText(/Outcome unknown/)).toBeTruthy());
    await type('again');
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    expect(sent).toHaveLength(1);
  });

  it('releases the thread only on an explicit acknowledgement', async () => {
    const { sent } = renderPanel();

    await openThread('alice');
    await type('for alice');
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /I checked what happened/ }));

    await waitFor(() => expect(screen.queryByText(/Outcome unknown/)).toBeNull());
    await type('for alice, deliberately');
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
    await waitFor(() => expect(sent).toHaveLength(2));
  });
});

describe('ChatPanel', () => {
  it('issues no reads while the wallet is locked', async () => {
    const query = vi.fn(async () => [] as unknown as never);
    render(
      <ChatPanel query={query} intent={async () => ({}) as never} on={() => () => {}}
        walletPubkey={ME} isWalletLocked unlockEpoch={0} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(query).not.toHaveBeenCalled();
  });
});
