import { useState } from 'react';

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

function ExtensionIcon({ detected }: { detected: boolean }) {
  return (
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${detected ? 'bg-green-100' : 'bg-gray-100'}`}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5A2.5 2.5 0 0 0 10.5 1 2.5 2.5 0 0 0 8 3.5V5H4a2 2 0 0 0-2 2v3.8h1.5c1.5 0 2.7 1.2 2.7 2.7S5 16.2 3.5 16.2H2V20a2 2 0 0 0 2 2h3.8v-1.5c0-1.5 1.2-2.7 2.7-2.7 1.5 0 2.7 1.2 2.7 2.7V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"
          fill={detected ? '#16a34a' : '#9ca3af'}
        />
      </svg>
    </div>
  );
}

function PopupIcon() {
  return (
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-orange-100">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="#f97316" strokeWidth="2" />
        <path d="M2 8h20" stroke="#f97316" strokeWidth="2" />
        <circle cx="5.5" cy="6" r="1" fill="#f97316" />
        <circle cx="8.5" cy="6" r="1" fill="#f97316" />
        <path d="M10 13l3-3m0 0h-2.5m2.5 0v2.5" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
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
  const [showModal, setShowModal] = useState(false);

  // Suppress unused warning — onConnect is kept for P1 iframe usage upstream
  void onConnect;

  const handleExtension = () => {
    setShowModal(false);
    onConnectExtension();
  };

  const handlePopup = () => {
    setShowModal(false);
    onConnectPopup();
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Sphere Connect</h1>
          <p className="text-gray-500 text-lg">Browser dApp Example</p>
        </div>

        <button
          onClick={() => !isConnecting && setShowModal(true)}
          disabled={isConnecting}
          className="px-8 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-2xl text-lg transition-colors shadow-lg shadow-orange-500/25 cursor-pointer disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Connecting...
            </span>
          ) : (
            'Connect Wallet'
          )}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl max-w-md text-center text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Connection method modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gray-900 text-center mb-1">Choose connection</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              How would you like to connect your Sphere wallet?
            </p>

            <div className="flex gap-3">
              {/* Extension option */}
              <button
                onClick={handleExtension}
                disabled={!extensionInstalled}
                className={`flex-1 flex flex-col items-center p-4 rounded-2xl border-2 transition-all
                  ${extensionInstalled
                    ? 'border-green-200 hover:border-green-400 hover:bg-green-50 cursor-pointer'
                    : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
                  }`}
              >
                <ExtensionIcon detected={extensionInstalled} />
                <span className={`text-sm font-semibold ${extensionInstalled ? 'text-gray-900' : 'text-gray-400'}`}>
                  Extension
                </span>
                <span className="text-xs text-gray-400 mt-0.5 text-center leading-tight">
                  {extensionInstalled ? 'Sphere extension detected' : 'Not installed'}
                </span>
              </button>

              {/* Popup option */}
              <button
                onClick={handlePopup}
                className="flex-1 flex flex-col items-center p-4 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-all cursor-pointer"
              >
                <PopupIcon />
                <span className="text-sm font-semibold text-gray-900">Popup</span>
                <span className="text-xs text-gray-400 mt-0.5 text-center leading-tight">
                  Opens sphere.unicity.network
                </span>
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
