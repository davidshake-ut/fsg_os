'use client';

import { AlertCircle } from 'lucide-react';

// Inline banner for data-load failures. Renders nothing when there is no
// error, so pages can pass the hook's error state straight through.
export default function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
      <div className="flex-1">
        <p className="font-medium">Could not load data</p>
        <p className="mt-0.5 text-red-700/80">{error}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          Retry
        </button>
      )}
    </div>
  );
}
