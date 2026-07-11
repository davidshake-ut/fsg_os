'use client';

import { useState } from 'react';
import { Search, X, Loader2, Hash, FolderKanban, User } from 'lucide-react';
import { Select } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ts_headline emits ⟦⟧ delimiters (same convention as Resources search).
function HighlightedSnippet({ text }) {
  if (!text) return null;
  const parts = text.split(/⟦|⟧/);
  return (
    <span className="text-xs leading-relaxed text-slate-500">
      {parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}

export default function MessageSearch({
  query, onQueryChange, senderId, onSenderChange, people,
  results, searching, searchError, onOpenResult, onClose,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex h-full flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search messages…"
            className={cn(
              'h-9 w-full rounded-lg border bg-white pl-8 pr-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 transition-colors',
              focused ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'
            )}
          />
        </div>
        <Select className="h-9 w-44 text-xs" value={senderId ?? ''} onChange={(e) => onSenderChange(e.target.value || null)}>
          <option value="">From anyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
          ))}
        </Select>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {searchError && <p className="py-4 text-center text-xs text-red-600">{searchError}</p>}

        {searching ? (
          <div className="flex justify-center py-12"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
        ) : !query.trim() ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Search your message history — by phrase, and optionally by sender.
          </p>
        ) : results.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No messages match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <div className="space-y-1">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenResult(r.conversation_id)}
                className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                  {r.sender_name || r.sender_email ? initials(r.sender_name, r.sender_email) : <User size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {r.sender_name || r.sender_email || 'Former member'}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">{fmtDate(r.created_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    {r.conversation_type === 'project' ? <FolderKanban size={10} /> : r.conversation_type === 'group' ? <Hash size={10} /> : null}
                    <span className="truncate">{r.conversation_name || 'Direct message'}</span>
                  </span>
                  <span className="mt-1 block">
                    <HighlightedSnippet text={r.headline} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
