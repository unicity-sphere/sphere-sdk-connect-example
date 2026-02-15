interface ConnectButtonProps {
  onConnect: () => void;
  isConnecting: boolean;
  error: string | null;
}

export function ConnectButton({ onConnect, isConnecting, error }: ConnectButtonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Sphere Connect</h1>
        <p className="text-gray-500 text-lg">Browser dApp Example</p>
      </div>

      <button
        onClick={onConnect}
        disabled={isConnecting}
        className="px-8 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-2xl text-lg transition-colors shadow-lg shadow-orange-500/25 cursor-pointer disabled:cursor-not-allowed"
      >
        {isConnecting ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl max-w-md text-center">
          {error}
        </div>
      )}
    </div>
  );
}
