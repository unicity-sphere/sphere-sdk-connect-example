import { useState } from 'react';
import { ERROR_CODES, INTENT_ACTIONS, nftContentToWire } from '@unicitylabs/sphere-sdk/connect';
import type { MintNftIntentParams, MintNftIntentResult, NftContent, NftLink } from '@unicitylabs/sphere-sdk/connect';
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
 *
 * WARNING: `nftContentToWire` / `nftContentFromWire` check SHAPE and base64 only. The VALUE rules
 * live in `encodeNftContent` (sphere-sdk `token-engine/nft-payload.ts`), which is what a wallet
 * runs before it signs, so a payload this panel builds can be well-shaped and still be refused.
 * The link rules are mirrored below rather than imported: `encodeNftContent` is exported from the
 * SDK's ROOT entry, and pulling the root into a dApp bundle to validate three fields would drag
 * the whole token engine in behind it.
 */

/** `SHA256_HEX_PATTERN` in sphere-sdk `token-engine/nft-payload.ts`. */
const SHA256_HEX = /^[0-9a-f]{64}$/i;
/** `MEDIA_TYPE_PATTERN` — a lowercase `type/subtype` with no parameters. */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;
/** `LINK_SCHEMES` and `MAX_URI_LENGTH`, same file. */
const LINK_SCHEMES = ['https://', 'ipfs://', 'ar://'];
const MAX_URI_LENGTH = 2048;
/** `hasSpaceOrControl`, char-for-char: any code unit at or below 0x20, or DEL. */
function hasSpaceOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * The same judgement `checkLink()` makes inside `encodeNftContent`, so the panel refuses a link
 * the wallet would refuse instead of sending it and blaming the wallet.
 *
 * An empty `sha256` is the trap this guards: it survives `nftContentFromWire`, which only asks
 * that the field be a string, and dies in `encodeNftContent`. The digest is not decoration — it
 * is what pins a hosted file to the token, so a link without one is content no wallet may sign.
 */
function describeLinkProblem(uri: string, sha256: string, mediaType: string): string | null {
  const scheme = LINK_SCHEMES.find((prefix) => uri.startsWith(prefix));
  if (scheme === undefined || uri.length === scheme.length) {
    return `Image URI must start with ${LINK_SCHEMES.join(', ')} and name a file.`;
  }
  if (uri.length > MAX_URI_LENGTH || hasSpaceOrControl(uri)) {
    return `Image URI must be at most ${MAX_URI_LENGTH} characters with no whitespace or control characters.`;
  }
  if (!MEDIA_TYPE.test(mediaType)) {
    return 'Image media type must be a lowercase type/subtype with no parameters, e.g. image/png.';
  }
  if (!SHA256_HEX.test(sha256)) {
    return 'Image SHA-256 must be the 64-hex digest of the linked file. A link without one is refused by the wallet, not by this page.';
  }
  return null;
}

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
   * single lookup. Only the explicit acknowledge button clears it, never a timer: nothing on
   * this side of the wire can learn what the wallet did.
   */
  | { kind: 'outcome-unknown'; message: string; tokenId: string | null }
  /** The wallet does not implement the action at all (-32601). Nothing happened. */
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string };

export function MintNftPanel({ intent }: Props) {
  const [name, setName] = useState('Connect Example NFT');
  const [description, setDescription] = useState('Minted from the Sphere Connect browser example');
  const [imageUri, setImageUri] = useState('');
  const [imageSha256, setImageSha256] = useState('');
  const [imageMediaType, setImageMediaType] = useState('image/png');
  const [hashing, setHashing] = useState(false);
  const [raw, setRaw] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);

  // An unresolved mint LOCKS the button. Nothing on this side of the wire can learn what the
  // wallet did, so only the user, having checked, may release it.
  const unresolved = outcome?.kind === 'outcome-unknown';
  // Only judged when a URI was typed: the image is optional, and no image at all is valid content.
  const linkProblem = imageUri ? describeLinkProblem(imageUri, imageSha256, imageMediaType) : null;

  /**
   * Fill the digest and the media type from the file itself. This is what a dApp does for real:
   * the digest has to be over the bytes a wallet would fetch, so guessing it is not an option.
   * A cross-origin host without CORS headers will refuse the read, hence the manual fields.
   */
  const hashLinkedFile = async () => {
    setHashing(true);
    try {
      const response = await fetch(imageUri);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      setImageSha256(
        Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
      );
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType && MEDIA_TYPE.test(contentType)) setImageMediaType(contentType);
    } catch (err) {
      const why = err instanceof Error ? err.message : 'failed';
      setOutcome({ kind: 'error', message: `Could not read ${imageUri} to hash it (${why}). Paste the SHA-256 by hand.` });
    } finally {
      setHashing(false);
    }
  };

  const execute = async () => {
    if (!name || unresolved || linkProblem) return;
    setLoading(true);
    setOutcome(null);
    setRaw(null);
    try {
      // A `link` image keeps the payload small. For an inline file use
      // `{ kind: 'media', media_type, bytes: <Uint8Array> }` and the codec base64s it.
      const image: NftLink | null = imageUri
        ? { kind: 'link', media_type: imageMediaType, uri: imageUri, sha256: imageSha256.toLowerCase() }
        : null;
      const content: NftContent = {
        kind: 'metadata',
        name,
        description: description || null,
        image,
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
        Requires wallet approval, Connect 2.3, scope <code className="font-mono">nft:mint</code> —
        its own scope, because the wallet signs content this page supplies
      </p>

      <div className="space-y-3">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)" rows={2} className="resize-none" />
        <Input type="text" value={imageUri} onChange={(e) => setImageUri(e.target.value)}
          placeholder="Image URI (optional, https:// ipfs:// or ar://, sent as a link)" />
        {imageUri && (
          <div className="space-y-3 pl-3 border-l border-white/10">
            <Input type="text" value={imageSha256} onChange={(e) => setImageSha256(e.target.value)}
              placeholder="Image SHA-256 (64 hex, required for a link)" />
            <Input type="text" value={imageMediaType} onChange={(e) => setImageMediaType(e.target.value)}
              placeholder="Image media type, e.g. image/png" />
            <button type="button" onClick={hashLinkedFile} disabled={hashing}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-white/15 text-white/70 hover:bg-white/5 disabled:opacity-40 transition-colors cursor-pointer">
              {hashing ? 'Hashing...' : 'Fetch the file and fill SHA-256 + media type'}
            </button>
            <p className="text-[11px] leading-relaxed text-white/40">
              An <code className="font-mono">NftLink</code> pins a hosted file by the SHA-256 of
              its bytes, and that digest is part of the signed content. There is no valid empty
              value: a wallet refuses the mint, it does not shrug it off.
            </p>
          </div>
        )}
        {linkProblem && <p className="text-xs text-red-400">{linkProblem}</p>}
        <Button onClick={execute} disabled={loading || unresolved || !name || !!linkProblem} className="w-full">
          {loading ? 'Minting...' : unresolved ? 'Mint NFT (locked — outcome unknown)' : 'Mint NFT'}
        </Button>
      </div>

      <MintNftOutcome outcome={outcome} onAcknowledge={() => setOutcome(null)} />
      <ResultDisplay result={raw} error={outcome?.kind === 'error' ? outcome.message : null} />
    </div>
  );
}

function MintNftOutcome({ outcome, onAcknowledge }: { outcome: Outcome | null; onAcknowledge: () => void }) {
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
        {/* The only way out of the lock. A button, never a timer: nothing here can learn what the
            wallet did, so the user is the only one who may say the doubt is settled. */}
        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-3 text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
        >
          I checked what happened — unlock the form
        </button>
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
