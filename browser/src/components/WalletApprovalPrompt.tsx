interface WalletApprovalPromptProps {
  onOpen: () => void;
}

/**
 * Floating prompt shown when the bridge iframe needs user interaction
 * (intent approval or first-time connection). The user must click to
 * satisfy the browser's popup-blocker user-gesture requirement.
 */
export function WalletApprovalPrompt({ onOpen }: WalletApprovalPromptProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-bounce">
      <button
        onClick={onOpen}
        className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg transition-colors text-sm font-medium"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        Wallet approval needed
      </button>
    </div>
  );
}
