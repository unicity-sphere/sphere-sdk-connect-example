import { useState } from 'react';
import { ERROR_CODES, INTENT_ACTIONS, nftContentToWire } from '@unicitylabs/sphere-sdk/connect';
import type { MintNftIntentParams, MintNftIntentResult, NftContent } from '@unicitylabs/sphere-sdk/connect';
import { Button, Input, Textarea } from '@unicitylabs/sphere-ui';
import { ResultDisplay } from '../ui/ResultDisplay';

interface Props {
  intent: <T>(action: string, params: Record<string, unknown>) => Promise<T>;
}

/**
 * The `mint_nft` intent — Connect 2.3, permission scope `nft:mint`.
 *
 * `nft:mint` is a scope of its own, and the host never auto-approves this action: minting an NFT
 * signs dApp-CHOSEN content as the user, which neither `mint:request` (a fungible self-mint) nor
 * `nft:transfer` (moving a token that already exists) implies.
 *
 * The content goes over the wire through `nftContentToWire()`. Connect messages are JSON, so an
 * inline `NftMedia.bytes` (a `Uint8Array`) has to become base64 — and every metadata field must
 * be present, with `null` for the ones that are absent. Building the `NftContent` in its natural
 * form and letting the codec convert it is the whole point; hand-rolled JSON drifts.
 */

/** A rejected error's numeric Connect code, duck-typed (see src/lib/connectErrors.ts for why). */
function errorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

/** A string field of the untrusted `data` bag a refusal may carry. */
function dataString(err: unknown, field: string): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const data = (err as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

type Outcome =
  | { kind: 'minted'; tokenId: string }
  /**
   * INTENT_OUTCOME_UNKNOWN (4201): the wallet TOOK the mint and the answer was lost. The token
   * may already exist. The button stays disabled — a second mint is a second token, and this is
   * the one situation where the natural reaction is the wrong one. `data.tokenId` is what the
   * host managed to attach before the answer went missing; when it is there, reconciling is a
   * single lookup.
   */
  | { kind: 'outcome-unknown'; message: string; tokenId: string | null }
  /** The wallet does not implement the action at all (-32601). Nothing happened. */
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string };

export function MintNftPanel({ intent }: Props) {
  const [name, setName] = useState('Connect Example NFT');
  const [description, setDescription] = useState('Minted from the Sphere Connect browser example');
  const [imageUri, setImageUri] = useState('');
  const [raw, setRaw] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);

  // An unresolved mint LOCKS the button. Nothing on this side of the wire can learn what the
  // wallet did, so only the user, having checked, may release it.
  const unresolved = outcome?.kind === 'outcome-unknown';

  const execute = async () => {
    if (!name || unresolved) return;
    setLoading(true);
    setOutcome(null);
    setRaw(null);
    try {
      const content: NftContent = {
        kind: 'metadata',
        name,
        description: description || null,
        // A `link` image keeps the payload small. For an inline file use
        // `{ kind: 'media', media_type, bytes: <Uint8Array> }` and the codec base64s it.
        image: imageUri
          ? { kind: 'link', media_type: 'image/png', uri: imageUri, sha256: '' }
          : null,
        // Every field is REQUIRED on the wire: an absent optional field is null, not missing.
        animation_url: null,
        external_url: null,
        attributes: [{ trait_type: 'source', value: 'connect-example' }],
        collection: null,
        collection_id: null,
      };
      // `sign` defaults to true — the wallet wraps the payload with its chain key as creator.
      const params: MintNftIntentParams = { content: nftContentToWire(content) };

      const result = await intent<MintNftIntentResult>(INTENT_ACTIONS.MINT_NFT, params);
      setRaw(result);
      setOutcome({ kind: 'minted', tokenId: result.tokenId });
    } catch (err) {
      const code = errorCode(err);
      const message = err instanceof Error ? err.message : 'Failed';
      if (code === ERROR_CODES.INTENT_OUTCOME_UNKNOWN) {
        setOutcome({ kind: 'outcome-unknown', message, tokenId: dataString(err, 'tokenId') });
      } else if (code === ERROR_CODES.METHOD_NOT_FOUND) {
        setOutcome({ kind: 'unsupported', message });
      } else {
        setOutcome({ kind: 'error', message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-white">Mint NFT</h2>
        <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">intent: mint_nft</span>
      </div>
      <p className="text-xs text-white/45 mb-1">Mint a coinless token from content this app chooses</p>
      <p className="text-[11px] text-amber-400 mb-4">
        Requires wallet approval · Connect 2.3 · scope <code className="font-mono">nft:mint</code> —
        its own scope, because the wallet signs content this page supplies
      </p>

      <div className="space-y-3">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)" rows={2} className="resize-none" />
        <Input type="text" value={imageUri} onChange={(e) => setImageUri(e.target.value)}
          placeholder="Image URI (optional — sent as a link, not inline bytes)" />
        <Button onClick={execute} disabled={loading || unresolved || !name} className="w-full">
          {loading ? 'Minting...' : unresolved ? 'Mint NFT (locked — outcome unknown)' : 'Mint NFT'}
        </Button>
      </div>

      <MintNftOutcome outcome={outcome} />
      <ResultDisplay result={raw} error={outcome?.kind === 'error' ? outcome.message : null} />
    </div>
  );
}

function MintNftOutcome({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;

  if (outcome.kind === 'minted') {
    return (
      <div className="mt-4 p-3 rounded-xl bg-green-500/10 border border-green-500/25">
        <p className="text-sm font-semibold text-green-400">Minted</p>
        <p className="mt-1 text-[10px] font-mono break-all text-white/45">tokenId: {outcome.tokenId}</p>
      </div>
    );
  }

  if (outcome.kind === 'outcome-unknown') {
    return (
      <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <p className="text-sm font-semibold text-amber-400">Outcome unknown — the token may already exist</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">
          The wallet accepted the mint and the answer never came back — Connect reports that as{' '}
          <code className="font-mono">INTENT_OUTCOME_UNKNOWN (4201)</code>. It is not a refusal.
        </p>
        <p className="mt-2 text-xs font-semibold text-amber-400">
          Do NOT mint again before you check. A second mint is a second token.
        </p>
        {outcome.tokenId && (
          <p className="mt-2 text-[10px] font-mono break-all text-white/45">
            the wallet reported tokenId: {outcome.tokenId} — look it up first
          </p>
        )}
        <p className="mt-1 text-[10px] font-mono text-white/30">{outcome.message}</p>
      </div>
    );
  }

  if (outcome.kind === 'unsupported') {
    return (
      <div className="mt-4 p-3 rounded-xl bg-white/4 border border-white/10">
        <p className="text-sm font-semibold text-white/70">This wallet does not implement mint_nft</p>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          <code className="font-mono">-32601</code>. Nothing happened. A protocol action is not a
          promise that the wallet on the other end serves it — this is exactly the answer{' '}
          <code className="font-mono">send_nft</code> gets from the Sphere wallet today.
        </p>
        <p className="mt-1 text-[10px] font-mono text-white/30">{outcome.message}</p>
      </div>
    );
  }

  return null;
}
