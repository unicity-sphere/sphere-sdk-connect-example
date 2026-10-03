import { useId } from 'react';
import { CustomSelect } from '@unicitylabs/sphere-ui';
import type { NetworkInfo } from '@unicitylabs/sphere-sdk/connect';
import { formatNetwork, networkOptions } from '../lib/networks';

interface NetworkPickerProps {
  /** The network to show as selected. */
  value: NetworkInfo;
  /** Called with the registry entry the user picked. Omit it, with `lockedReason`, for a read-only display. */
  onChange?: (network: NetworkInfo) => void;
  /**
   * Why the control cannot be used right now. Setting it turns the picker into a plain readout,
   * and it is also the text the user reads — a control that goes dead never does so without
   * saying why.
   */
  lockedReason?: string;
  /** Label and control on one line, the explanation kept for the tooltip and screen readers. */
  compact?: boolean;
}

const OPEN_HINT =
  'The network this app declares in the handshake. A wallet on another network refuses it (INCOMPATIBLE_NETWORK, 4008).';

/**
 * Picks which network the dApp declares to the wallet. The options are the SDK's own
 * `SPHERE_NETWORKS`, labelled from it; nothing here names a network.
 *
 * sphere-ui's `CustomSelect`, not a native `<select>`, for the same reason the wallet has no
 * native `<option>` anywhere and the two other pickers in this app already use it: Chromium paints
 * a native dropdown from the control's own colours, and against this dark theme — translucent
 * white over a near-black page — the popup composites that over a LIGHT base and every
 * unhighlighted row comes out white on white.
 *
 * What that trade costs, measured, so nobody rediscovers it:
 *  - KEYBOARD. The native control gave arrow keys, type-ahead and Home/End, with focus staying
 *    put. CustomSelect has no key handling beyond a document-level Escape, and it portals its rows
 *    into `document.body` AFTER `#root`: from the trigger, Tab reaches the next control on the
 *    page — on the connect screen that is "Connect Wallet" — before it reaches any row, and
 *    choosing one drops focus to `<body>`. This is the interaction the component exists for, and
 *    it is a regression. It belongs to CustomSelect, which the wallet and the other two pickers
 *    here share; it cannot be repaired from this file.
 *  - The trigger carries no `role`, `aria-expanded` or name of its own, so the hint hangs off the
 *    wrapping group and a screen reader is never told a list opened.
 *  - No `disabled`, so `lockedReason` renders a readout rather than a dead control.
 */
export function NetworkPicker({ value, onChange, lockedReason, compact = false }: NetworkPickerProps) {
  const hintId = useId();
  const options = networkOptions();
  // Matched by id, the key the wallet compares — not by object identity.
  const selected = options.find((option) => option.network.id === value.id);
  const hint = lockedReason ?? OPEN_HINT;
  // A wallet answers with an id only. When it is one the registry lacks, the label is built from
  // the id itself — that is all there is to say about it.
  const currentLabel = selected?.label ?? formatNetwork(value) ?? 'unknown network';
  // Read-only when something locks it, and also when the current network is not in the registry:
  // there is nothing to pick it from, and feeding it to the chooser would render a network the
  // session is really on in the greyed styling that means "nothing selected yet".
  const readOnly = lockedReason !== undefined || !selected;
  const width = compact ? 'w-36' : 'w-44';

  return (
    <div className={compact ? 'flex items-center' : 'flex flex-col items-center gap-2'}>
      <div
        role="group"
        aria-label="Network"
        aria-describedby={hintId}
        // Compact hides the explanation paragraph, so hover text is the only place it stays
        // readable. On the group, so it covers the readout and the live control alike.
        title={compact ? hint : undefined}
        className="flex items-center gap-2 text-sm text-white/55"
      >
        <span className={compact ? 'hidden sm:inline' : undefined}>Network</span>
        {readOnly ? (
          // Width on a plain wrapper, skin on the inner box — the shape CustomSelect itself uses,
          // and the reason it works: `.admin-input` is unlayered CSS from sphere-ui, so its own
          // `width: 100%` beats a Tailwind width utility on the same element however they are
          // ordered. Measured with both on one span: 77px against the live control's 176px, a
          // ~99px jump the moment the picker locked. No text-size class for the same reason —
          // `.admin-input` pins 13px and wins, on the control too, so leaving it alone is what
          // actually matches.
          <span className={`${width} inline-block`}>
            <span className="admin-input block truncate opacity-70">{currentLabel}</span>
          </span>
        ) : (
          <CustomSelect
            options={options.map((option) => ({ value: option.key, label: option.label }))}
            value={selected.key}
            onChange={(key) => {
              const picked = options.find((option) => option.key === key);
              if (picked) onChange?.(picked.network);
            }}
            size={compact ? 'sm' : 'md'}
            className={width}
          />
        )}
      </div>
      <p id={hintId} className={compact ? 'sr-only' : 'max-w-xs text-center text-xs text-white/45'}>
        {hint}
      </p>
    </div>
  );
}
