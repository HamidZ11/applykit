import { useState } from 'react';
import { autofill, type FillResult } from '@/autofill/fill';
import { SAMPLE_PROFILE } from '@/domain/profile';

interface PanelProps {
  onClose: () => void;
}

/**
 * Technical placeholder for the floating panel. Not a design: the visual
 * direction is decided later through the design approval process.
 */
export function Panel({ onClose }: PanelProps) {
  const [result, setResult] = useState<FillResult | null>(null);

  return (
    <div
      role="dialog"
      aria-label="ApplyKit"
      className="fixed right-4 bottom-4 w-72 rounded-lg border border-neutral-300 bg-white p-4 font-sans text-sm text-neutral-900 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">ApplyKit is running</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ApplyKit"
          className="rounded px-2 py-0.5 text-neutral-500 hover:bg-neutral-100"
        >
          ✕
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setResult(autofill(document, SAMPLE_PROFILE));
        }}
        className="mt-3 w-full rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
      >
        Fill sample data
      </button>

      {result && <ResultSummary result={result} />}
    </div>
  );
}

function ResultSummary({ result }: { result: FillResult }) {
  return (
    <ul
      className="mt-3 space-y-0.5 text-xs text-neutral-600"
      aria-live="polite"
    >
      <li>Filled: {result.filled.length}</li>
      {result.skipped.length > 0 && (
        <li>Skipped (already filled): {result.skipped.length}</li>
      )}
      {result.missing.length > 0 && (
        <li>Not found: {result.missing.join(', ')}</li>
      )}
    </ul>
  );
}
