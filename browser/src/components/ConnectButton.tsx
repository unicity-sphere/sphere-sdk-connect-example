import { Button } from '@unicitylabs/sphere-ui';
import { EnvSwitch } from './EnvSwitch';

interface ConnectButtonProps {
  onConnect: () => void;
  onConnectExtension: () => void;
  onConnectPopup: () => void;
  isConnecting: boolean;
  extensionInstalled: boolean;
  error: string | null;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function ConnectButton({
  onConnect,
  onConnectExtension,
  onConnectPopup,
  isConnecting,
  extensionInstalled,
  error,
}: ConnectButtonProps) {
  // Extension connection is temporarily hidden — popup is the only method for now,
  // so "Connect Wallet" opens the popup directly (no method chooser modal).
  // These props are kept so re-enabling the extension option needs no App.tsx change.
  void onConnect;
  void onConnectExtension;
  void extensionInstalled;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Sphere Connect</h1>
        <p className="text-white/45 text-lg">Browser dApp Example</p>
      </div>

      <EnvSwitch />

      <Button
        onClick={() => !isConnecting && onConnectPopup()}
        disabled={isConnecting}
        className="px-8 py-4 text-lg shadow-lg shadow-orange-500/25"
      >
        {isConnecting ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </Button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl max-w-md text-center text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
