/**
 * The mock wallet's intent answers, in their own module.
 *
 * Extracted from mock-wallet-server.ts for the same reason mockSphere.ts was: importing that
 * file starts a WebSocket server as a side effect, so a test cannot reach the answers inside it.
 *
 * These are what a dApp developer reads to learn each intent's result shape, so they mirror the
 * REAL Sphere wallet — including where it refuses. `send_nft` is the interesting case: it is a
 * declared Connect 2.2 action that no wallet implements, and a mock that cheerfully succeeded
 * would teach a dApp to ship a flow that cannot work.
 */
import { ERROR_CODES, INTENT_ACTIONS, nftContentFromWire } from '@unicitylabs/sphere-sdk/connect';
import { encodeNftContent } from '@unicitylabs/sphere-sdk/token-engine';

/** Exactly what `ConnectHostConfig.onIntent` must resolve with. */
export interface IntentAnswer {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export async function answerIntent(
  action: string,
  params: Record<string, unknown>,
): Promise<IntentAnswer> {
  switch (action) {
    case INTENT_ACTIONS.SEND:
      return {
        result: {
          id: `xfer-${Date.now()}`, status: 'delivered',
          tokens: [{ id: `tok-new-${Date.now()}`, coinId: params.coinId ?? 'UCT', amount: params.amount, status: 'transferring' }],
          tokenTransfers: [{ sourceTokenId: 'tok-abc123def456', method: 'direct' }],
        },
      };
    case INTENT_ACTIONS.MINT:
      return {
        result: {
          tokenId: 'aa'.repeat(32),
          coinId: params.coinId,
          amount: params.amount,
        },
      };
    case INTENT_ACTIONS.DM:
      return { result: { sent: true, messageId: `msg-${Date.now()}`, timestamp: Date.now() } };
    case INTENT_ACTIONS.PAYMENT_REQUEST:
      return { result: { success: true, requestId: `pr-${Date.now()}`, createdAt: Date.now() } };
    case INTENT_ACTIONS.RECEIVE:
      return {
        result: {
          transfers: [{
            id: 'inc-1', senderPubkey: '03fed...', senderNametag: 'charlie',
            tokens: [{ id: 'tok-inc1', coinId: 'UCT', amount: '50000000' }],
            receivedAt: Date.now(),
          }],
        },
      };
    case INTENT_ACTIONS.SIGN_MESSAGE:
      return { result: { signature: '3045022100abcdef...', message: params.message, publicKey: '02abc123...' } };
    case INTENT_ACTIONS.MINT_NFT: {
      // A real wallet runs BOTH checks before it shows an approval screen, and so must this mock
      // or it accepts content the wallet would refuse:
      //
      //   1. nftContentFromWire  — SHAPE and base64 only. Every field present, an absent optional
      //      field null rather than missing, inline bytes canonical base64.
      //   2. encodeNftContent    — the VALUE rules, in sphere-sdk token-engine/nft-payload.ts:
      //      media types lowercase type/subtype, link URIs https:// ipfs:// ar:// within 2048
      //      characters, inline media non-empty, and a link's sha256 the 64-hex digest of the
      //      linked file. An EMPTY sha256 passes check 1 and dies here — which is the whole
      //      point: the digest is what pins a hosted file to the token.
      //
      // Both throw a SphereError naming the offending field, which becomes INVALID_PARAMS.
      // Signing dApp-chosen content without running them is exactly what `nft:mint` being its
      // own scope exists to prevent.
      try {
        encodeNftContent(nftContentFromWire((params as { content?: unknown }).content));
      } catch (err) {
        return {
          error: {
            code: ERROR_CODES.INVALID_PARAMS,
            message: err instanceof Error ? err.message : 'Invalid NFT content',
          },
        };
      }
      // MintNftIntentResult is `{ tokenId }` — 64 lowercase hex — and nothing else.
      return { result: { tokenId: 'bb'.repeat(32) } };
    }
    case INTENT_ACTIONS.SEND_NFT:
      // What the REAL Sphere wallet answers today.
      return {
        error: {
          code: ERROR_CODES.METHOD_NOT_FOUND,
          message: `Unknown intent: ${INTENT_ACTIONS.SEND_NFT}`,
        },
      };
    default:
      return { result: { success: true, action, timestamp: Date.now() } };
  }
}
