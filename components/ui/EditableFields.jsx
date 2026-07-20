'use client';

import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { fmtDate } from '@/lib/format';

// Inline click-to-edit fields (pencil → input → ✓/✕), the overview-card
// editing pattern shared by the CRM 360° and project detail pages.
export function EditableField({ label, value, onSave, type = 'text', placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const commit = async () => {
    const v = draft.trim() || null;
    if (v !== (value ?? null)) await onSave(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
        <div className="flex items-center gap-1">
          <input autoFocus type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-blue-400 px-2 py-1 text-sm outline-none ring-2 ring-blue-500/20" />
          <button type="button" onClick={commit} aria-label="Save" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
          <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-slate-400">{label}</p>
      <button type="button" onClick={() => { setDraft(value ?? ''); setEditing(true); }} aria-label={`Edit ${label}`}
        className="group flex items-center gap-1 text-sm text-slate-700 hover:text-blue-600">
        {value ? (type === 'date' ? fmtDate(value) : value) : <span className="text-slate-300 italic">—</span>}
        <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

export function EditableTextarea({ label, value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const commit = async () => {
    const v = draft.trim() || null;
    if (v !== (value ?? null)) await onSave(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div>
        {label && <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>}
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-blue-400 px-2 py-1.5 text-sm outline-none ring-2 ring-blue-500/20 resize-none"
        />
        <div className="mt-1.5 flex gap-1">
          <button onClick={commit} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700">
            <Check size={12} /> Save
          </button>
          <button onClick={() => { setDraft(value ?? ''); setEditing(false); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {label && <p className="mb-0.5 text-xs font-medium text-slate-400">{label}</p>}
      <button
        onClick={() => { setDraft(value ?? ''); setEditing(true); }}
        className="group flex w-full items-start gap-1 text-left text-sm text-slate-700 hover:text-blue-600"
      >
        <span className="flex-1 whitespace-pre-wrap">
          {value || <span className="italic text-slate-300">—</span>}
        </span>
        <Pencil size={11} className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </div>
  );
}
