import { AlertBanner } from '@unicitylabs/sphere-ui';
import { supportsGracefulLock } from '../../lib/walletProtocol';

interface WalletStatusBannerProps {
  isWalletLocked: boolean;
  walletChanged: boolean;
  walletProtocol: string | null;
}

/**
 * The visible half of the Connect 2.1 lock model.
 *
 * A locked wallet is a STATE, not a disconnect: the session, the granted permissions and the
 * transport all survive, and every request outside the locked allow-list is answered
 * WALLET_LOCKED (4009) until the user unlocks. Without this banner the app looks perfectly
 * connected while every panel errors.
 *
 * The banner never offers to unlock. The wallet raises its own credential surface, from its own
 * chrome, after a human click — a dApp may trigger a CONSENT prompt but never a password field.
 */
export function WalletStatusBanner({ isWalletLocked, walletChanged, walletProtocol }: WalletStatusBannerProps) {
  const legacyWallet = !supportsGracefulLock(walletProtocol);
  if (!isWalletLocked && !walletChanged && !legacyWallet) return null;

  return (
    <div className="mb-4 space-y-2">
      {isWalletLocked && (
        <AlertBanner type="warning" title="Wallet locked">
          You are still connected — the wallet kept this session. Requests fail with{' '}
          <code>WALLET_LOCKED (4009)</code> until you unlock it in the wallet window. No reconnect
          and no re-approval is needed.
        </AlertBanner>
      )}
      {walletChanged && (
        <AlertBanner type="info" title="Wallet changed">
          The wallet that came back from the lock has a different public key than the one this
          session was approved for. Nothing was resumed automatically — check the identity in the
          header before sending anything.
        </AlertBanner>
      )}
      {legacyWallet && (
        <AlertBanner type="info" title="Legacy wallet">
          This wallet speaks Connect {walletProtocol ?? 'unknown'}, where locking also ends the
          session — the connection will drop instead of pausing, and no <code>wallet:unlocked</code>{' '}
          is ever sent. Update the wallet for the session-preserving lock.
        </AlertBanner>
      )}
    </div>
  );
}
