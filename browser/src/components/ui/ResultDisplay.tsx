import { useState } from 'react';

interface ResultDisplayProps {
  result: unknown;
  error: string | null;
}

export function ResultDisplay({ result, error }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!result && !error) return null;

  const json = result ? JSON.stringify(result, null, 2) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (error) {
    return (
      <div className="mt-4 p-3 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-white/45">Result</span>
        <button
          onClick={handleCopy}
          className="text-xs text-white/45 hover:text-white cursor-pointer transition-colors"
        >
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>
      <pre className="p-3 rounded-xl text-xs overflow-auto max-h-64 font-mono bg-white/3 border border-white/8 text-white/70">
        {json}
      </pre>
    </div>
  );
}
