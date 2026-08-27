'use client';

import { useEffect, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { Button, Field, TextInput } from '@/components/ui/primitives';

// Names the design option a quote is about to be cloned into
// (complex-project Builder, Phase 6). The current quote keeps everything;
// the clone starts as a fresh draft with the same design so the two can
// diverge — coverage, vendor, architecture — and be compared later.
export default function CloneOptionModal({ open, sourceLabel = '', suggested = '', busy = false, onConfirm, onCancel }) {
  const [label, setLabel] = useState(suggested);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!label.trim() || busy) return;
    onConfirm(label.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="clone-option-title">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onCancel} />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          <X size={15} />
        </button>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Copy size={17} />
          </span>
          <div className="min-w-0">
            <p id="clone-option-title" className="text-sm font-semibold text-slate-900">Clone as a design option</p>
            <p className="mt-1 text-sm text-slate-500">
              A copy of this proposal becomes a sibling option on the same property
              {sourceLabel ? ` alongside “${sourceLabel}”` : ''}. Change its coverage, vendor, or architecture, then compare them on the Proposals page.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Field label="Option name">
            <TextInput autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Extended coverage · Wi-Fi 7" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={!label.trim() || busy}>
            {busy ? 'Cloning…' : 'Create option'}
          </Button>
        </div>
      </form>
    </div>
  );
}
