import { useId } from 'react';
import { Select } from '@unicitylabs/sphere-ui';
import type { NetworkInfo } from '@unicitylabs/sphere-sdk/connect';
import { formatNetwork, networkOptions } from '../lib/networks';

interface NetworkPickerProps {
  /** The network to show as selected. */
  value: NetworkInfo;
  /** Called with the registry entry the user picked. Omit it, with `lockedReason`, for a read-only display. */
  onChange?: (network: NetworkInfo) => void;
  /**
   * Why the control cannot be used right now. Setting it disables the control, and it is also the
   * text the user reads — a control that goes dead never does so without saying why.
   */
  lockedReason?: string;
  /** Label and select on one line, the explanation kept for the tooltip and screen readers. */
  compact?: boolean;
}

/** The <option> value of a network the registry does not list (see below). Never selectable. */
const UNLISTED = '';

const OPEN_HINT =
  'The network this app declares in the handshake. A wallet on another network refuses it (INCOMPATIBLE_NETWORK, 4008).';

/**
 * Picks which network the dApp declares to the wallet. The options are the SDK's own
 * `SPHERE_NETWORKS`, labelled from it; nothing here names a network.
 */
export function NetworkPicker({ value, onChange, lockedReason, compact = false }: NetworkPickerProps) {
  const hintId = useId();
  const options = networkOptions();
  // Matched by id, the key the wallet compares — not by object identity.
  const selected = options.find((option) => option.network.id === value.id);
  const hint = lockedReason ?? OPEN_HINT;

  return (
    <div className={compact ? 'flex items-center' : 'flex flex-col items-center gap-2'}>
      <label className="flex items-center gap-2 text-sm text-white/55">
        <span className={compact ? 'hidden sm:inline' : undefined}>Network</span>
        <Select
          value={selected?.key ?? UNLISTED}
          onChange={(e) => {
            const picked = options.find((option) => option.key === e.target.value);
            if (picked) onChange?.(picked.network);
          }}
          disabled={lockedReason !== undefined}
          aria-describedby={hintId}
          title={compact ? hint : undefined}
          className={compact ? 'w-auto max-w-[9rem] py-1! pl-3! text-xs' : 'w-auto'}
        >
          {/* A wallet answers with an id only. If it is one the registry lacks, a <select> with no
              matching option would quietly show the first entry: a network the session is not on. */}
          {!selected && (
            <option value={UNLISTED} disabled>
              {formatNetwork(value) ?? 'unknown network'}
            </option>
          )}
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <p id={hintId} className={compact ? 'sr-only' : 'max-w-xs text-center text-xs text-white/45'}>
        {hint}
      </p>
    </div>
  );
}
