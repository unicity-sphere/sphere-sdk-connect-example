/**
 * The Connect 2.3 NFT intents, as this example demonstrates them.
 *
 * Two things are pinned here:
 *   1. `mint_nft` round-trips through `nftContentToWire` / `nftContentFromWire`. The wire form is
 *      JSON, so inline media bytes are base64 and EVERY metadata field must be present — an
 *      absent optional field is `null`, not missing. A dApp that hand-rolls the JSON discovers
 *      that at runtime, in the wallet's refusal.
 *   2. `send_nft` is answered `-32601`. It is a declared Connect 2.2 action that the Sphere
 *      wallet does not implement, and this repo's mock must not pretend otherwise: an example
 *      that succeeds where the real wallet refuses teaches a flow that cannot ship.
 */
import { describe, it, expect } from 'vitest';
import { ERROR_CODES, INTENT_ACTIONS, nftContentToWire } from '@unicitylabs/sphere-sdk/connect';
import type { MintNftIntentParams, MintNftIntentResult, NftContent } from '@unicitylabs/sphere-sdk/connect';
import { answerIntent } from './mockIntents';

const CONTENT: NftContent = {
  kind: 'metadata',
  name: 'Connect Example NFT',
  description: 'Minted from the Sphere Connect Node.js example',
  image: null,
  animation_url: null,
  external_url: null,
  attributes: [{ trait_type: 'source', value: 'connect-example' }],
  collection: null,
  collection_id: null,
};

describe('mint_nft', () => {
  it('accepts the wire form nftContentToWire produces and answers with a tokenId', async () => {
    const params: MintNftIntentParams = { content: nftContentToWire(CONTENT) };

    const answer = await answerIntent(INTENT_ACTIONS.MINT_NFT, params);

    expect(answer.error).toBeUndefined();
    const result = answer.result as MintNftIntentResult;
    // MintNftIntentResult is `{ tokenId }`, 64 lowercase hex, and nothing else.
    expect(result.tokenId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries an inline image through as base64 rather than bytes', () => {
    const wire = nftContentToWire({
      ...CONTENT,
      image: { kind: 'media', media_type: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    });

    // Connect messages are JSON: a Uint8Array would serialise as {"0":1,"1":2,…} and the wallet
    // would refuse it. This is the whole reason the codec exists.
    expect(wire).toMatchObject({ image: { kind: 'media', media_type: 'image/png', bytes: 'AQID' } });
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
  });

  // A wallet DECODES before it shows an approval screen — signing dApp-chosen content blind is
  // exactly what `nft:mint` being its own scope is about.
  it('is refused with INVALID_PARAMS when the content cannot be decoded', async () => {
    const content = nftContentToWire(CONTENT) as unknown as Record<string, unknown>;
    const { name: _dropped, ...missingName } = content;

    const answer = await answerIntent(INTENT_ACTIONS.MINT_NFT, { content: missingName });

    expect(answer.result).toBeUndefined();
    expect(answer.error?.code).toBe(ERROR_CODES.INVALID_PARAMS);
    // The refusal names the offending field, so a developer can act on it.
    expect(answer.error?.message).toContain('name');
  });

  it('is refused when content is missing entirely', async () => {
    const answer = await answerIntent(INTENT_ACTIONS.MINT_NFT, {});
    expect(answer.error?.code).toBe(ERROR_CODES.INVALID_PARAMS);
  });
});

describe('send_nft', () => {
  it('is answered -32601, the way the real Sphere wallet answers it', async () => {
    const answer = await answerIntent(INTENT_ACTIONS.SEND_NFT, { to: '@bob', tokenId: 'ab'.repeat(32) });

    expect(answer.result).toBeUndefined();
    expect(answer.error?.code).toBe(ERROR_CODES.METHOD_NOT_FOUND);
  });

  // The canary: the default branch returns `{ success: true }` for anything it does not know, so
  // deleting the send_nft case would silently turn the refusal into a fake success.
  it('does not fall through to the catch-all success answer', async () => {
    const answer = await answerIntent(INTENT_ACTIONS.SEND_NFT, {});
    expect(answer.result).not.toMatchObject({ success: true });
  });
});
