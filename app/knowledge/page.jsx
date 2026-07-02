'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Upload, FileText, Code2, Hash, AlignLeft, File, X,
  Trash2, Download, Plus, Loader2,
  BookOpen, MoreHorizontal, AlertCircle,
  BookMarked, LayoutGrid, List, ListOrdered, Link2, FilePlus,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ErrorBanner from '@/components/ui/ErrorBanner';

// ── Color system ─────────────────────────────────────────────────────────────
// All class strings are literals so Tailwind JIT scans them correctly.
const COLOR = {
  blue:   { dot: 'bg-blue-500',   pill: 'bg-blue-50 text-blue-700 border-blue-200',   active: 'bg-blue-50 text-blue-700' },
  indigo: { dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200', active: 'bg-indigo-50 text-indigo-700' },
  violet: { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 border-violet-200', active: 'bg-violet-50 text-violet-700' },
  green:  { dot: 'bg-green-500',  pill: 'bg-green-50 text-green-700 border-green-200',   active: 'bg-green-50 text-green-700' },
  teal:   { dot: 'bg-teal-500',   pill: 'bg-teal-50 text-teal-700 border-teal-200',     active: 'bg-teal-50 text-teal-700' },
  orange: { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700 border-orange-200', active: 'bg-orange-50 text-orange-700' },
  red:    { dot: 'bg-red-500',    pill: 'bg-red-50 text-red-700 border-red-200',         active: 'bg-red-50 text-red-700' },
  amber:  { dot: 'bg-amber-500',  pill: 'bg-amber-50 text-amber-700 border-amber-200',   active: 'bg-amber-50 text-amber-700' },
  pink:   { dot: 'bg-pink-500',   pill: 'bg-pink-50 text-pink-700 border-pink-200',      active: 'bg-pink-50 text-pink-700' },
  cyan:   { dot: 'bg-cyan-500',   pill: 'bg-cyan-50 text-cyan-700 border-cyan-200',      active: 'bg-cyan-50 text-cyan-700' },
  slate:  { dot: 'bg-slate-400',  pill: 'bg-slate-100 text-slate-600 border-slate-200',  active: 'bg-slate-100 text-slate-600' },
};

const COLOR_KEYS = Object.keys(COLOR);

function colorOf(group) { return COLOR[group?.color] ?? COLOR.slate; }

// ── File type metadata ────────────────────────────────────────────────────────
const FILE_META = {
  pdf:  { label: 'PDF',  icon: FileText,  cls: 'text-red-500',    bg: 'bg-red-50'    },
  html: { label: 'HTML', icon: Code2,     cls: 'text-orange-500', bg: 'bg-orange-50' },
  md:   { label: 'MD',   icon: Hash,      cls: 'text-violet-500', bg: 'bg-violet-50' },
  docx: { label: 'DOCX', icon: FileText,  cls: 'text-blue-500',   bg: 'bg-blue-50'   },
  doc:  { label: 'DOC',  icon: FileText,  cls: 'text-blue-400',   bg: 'bg-blue-50'   },
  txt:  { label: 'TXT',  icon: AlignLeft, cls: 'text-slate-500',  bg: 'bg-slate-100' },
};
function fileMeta(type) { return FILE_META[type] ?? { label: type?.toUpperCase() ?? 'FILE', icon: File, cls: 'text-slate-400', bg: 'bg-slate-100' }; }

function FileTypeIcon({ type, size = 16 }) {
  const { icon: Icon, cls } = fileMeta(type);
  return <Icon size={size} className={cls} />;
}

function FileTypeBadge({ type }) {
  const { label, cls, bg } = fileMeta(type);
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls, bg)}>
      {label}
    </span>
  );
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── HighlightedSnippet ────────────────────────────────────────────────────────
// Parses ts_headline output that uses ⟦matched⟧ delimiters.
function HighlightedSnippet({ text, className }) {
  if (!text) return null;
  const parts = text.split(/⟦|⟧/);
  return (
    <span className={cn('text-xs leading-relaxed text-slate-500', className)}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900 not-italic">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

// Highlight search terms in plain text (used for document name matching).
function HighlightName({ text, query }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-100 px-0.5 text-amber-900">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}


// ── Groups sidebar ────────────────────────────────────────────────────────────
function GroupsSidebar({ groups, activeGroup, onSelect, onCreate, onUpdate, onDelete, docCounts }) {
  const [adding,    setAdding]    = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newColor,  setNewColor]  = useState('blue');
  const [menuOpen,  setMenuOpen]  = useState(null); // group id

  const total = Object.values(docCounts).reduce((s, n) => s + n, 0);

  const submit = async () => {
    const n = newName.trim();
    if (!n) return;
    await onCreate(n, newColor);
    setNewName(''); setNewColor('blue'); setAdding(false);
  };

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <BookMarked size={15} className="text-blue-600" />
        <span className="text-sm font-semibold text-slate-800">Knowledge Base</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* All documents */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
            activeGroup === null
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-slate-600 hover:bg-white hover:text-slate-800'
          )}
        >
          <BookOpen size={14} className="shrink-0" />
          <span className="flex-1 text-left">All Documents</span>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
            {total}
          </span>
        </button>

        {groups.length > 0 && (
          <div className="my-1.5 border-t border-slate-200" />
        )}

        {groups.map((g) => {
          const c = colorOf(g);
          const count = docCounts[g.id] ?? 0;
          const isActive = activeGroup === g.id;
          return (
            <div key={g.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(g.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                  isActive ? c.active + ' font-medium' : 'text-slate-600 hover:bg-white hover:text-slate-800'
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', c.dot)} />
                <span className="flex-1 truncate text-left">{g.name}</span>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
                  {count}
                </span>
              </button>

              {/* ⋯ actions */}
              <button
                type="button"
                onClick={() => setMenuOpen(menuOpen === g.id ? null : g.id)}
                className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 group-hover:flex"
              >
                <MoreHorizontal size={13} />
              </button>
              {menuOpen === g.id && (
                <div
                  className="absolute left-full top-0 z-30 ml-1 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                  onMouseLeave={() => setMenuOpen(null)}
                >
                  <p className="mb-1 px-2 text-[10px] uppercase tracking-wide text-slate-400">Color</p>
                  <div className="flex flex-wrap gap-1 px-2 pb-2">
                    {COLOR_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        title={k}
                        onClick={() => { onUpdate(g.id, { color: k }); setMenuOpen(null); }}
                        className={cn('h-4 w-4 rounded-full transition-transform hover:scale-110', COLOR[k].dot,
                          g.color === k && 'ring-2 ring-offset-1 ring-slate-500 scale-110')}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { onDelete(g.id, g.name); setMenuOpen(null); }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={11} /> Delete group
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Add group */}
      <div className="border-t border-slate-200 p-2">
        {adding ? (
          <div className="space-y-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="Group name"
              className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-400/20"
            />
            <div className="flex flex-wrap gap-1">
              {COLOR_KEYS.slice(0, 8).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNewColor(k)}
                  className={cn('h-3.5 w-3.5 rounded-full transition-transform hover:scale-110', COLOR[k].dot,
                    newColor === k && 'ring-2 ring-offset-1 ring-slate-500 scale-110')}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={submit}
                className="flex-1 rounded-lg bg-blue-600 py-1 text-[11px] font-medium text-white hover:bg-blue-700">
                Create
              </button>
              <button type="button" onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-slate-200 py-1 text-[11px] text-slate-500 hover:bg-slate-100">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-white hover:text-blue-600 transition-colors">
            <Plus size={12} /> New Group
          </button>
        )}
      </div>
    </aside>
  );
}

// ── Upload progress cards (shown in the grid during upload) ──────────────────
function UploadProgressCard({ name, progress, status, error }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 opacity-80">
      <div className="flex items-center gap-2">
        {status === 'error'
          ? <AlertCircle size={16} className="shrink-0 text-red-500" />
          : <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />}
        <span className="truncate text-sm font-medium text-slate-700">{name}</span>
      </div>
      {status === 'error' ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 capitalize">{status}…</p>
        </>
      )}
    </div>
  );
}

// ── Document card (browse mode) ───────────────────────────────────────────────
function DocCard({ doc, group, groups, onClick, onDelete, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { bg } = fileMeta(doc.file_type);

  return (
    <div
      className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg)}>
          <FileTypeIcon type={doc.file_type} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{doc.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {group && (
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', colorOf(group).pill)}>
                <span className={cn('h-1.5 w-1.5 rounded-full', colorOf(group).dot)} />
                {group.name}
              </span>
            )}
            <FileTypeBadge type={doc.file_type} />
          </div>
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="hidden rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 group-hover:flex"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-2 top-10 z-20 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Move to group</p>
            <button type="button"
              onClick={() => { onMove(doc.id, null); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <BookOpen size={11} /> No group
            </button>
            {groups.filter((g) => g.id !== doc.group_id).map((g) => (
              <button key={g.id} type="button"
                onClick={() => { onMove(doc.id, g.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                <span className={cn('h-2 w-2 rounded-full', colorOf(g).dot)} />
                {g.name}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button type="button"
              onClick={() => { onDelete(doc.id, doc.name); setMenuOpen(false); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
      </div>

      {doc.description && (
        <p className="line-clamp-2 text-xs text-slate-400">{doc.description}</p>
      )}

      <div className="flex items-center gap-2 text-[10px] text-slate-300">
        <span>{fmtDate(doc.created_at)}</span>
        {doc.file_size && <span>· {fmtSize(doc.file_size)}</span>}
      </div>
    </div>
  );
}

// ── Document row (details / list view) ───────────────────────────────────────
function DocRow({ doc, group, groups, onClick, onDelete, onMove }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50 last:border-b-0"
      onClick={onClick}
    >
      {/* Icon */}
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', fileMeta(doc.file_type).bg)}>
        <FileTypeIcon type={doc.file_type} size={14} />
      </div>

      {/* Name */}
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{doc.name}</p>

      {/* Group */}
      <div className="w-32 shrink-0">
        {group ? (
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', colorOf(group).pill)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', colorOf(group).dot)} />
            {group.name}
          </span>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </div>

      {/* Type */}
      <div className="w-14 shrink-0">
        <FileTypeBadge type={doc.file_type} />
      </div>

      {/* Size */}
      <p className="w-16 shrink-0 text-right text-xs text-slate-400 tabular-nums">{fmtSize(doc.file_size) || '—'}</p>

      {/* Date */}
      <p className="w-28 shrink-0 text-right text-xs text-slate-400 tabular-nums">{fmtDate(doc.created_at)}</p>

      {/* Actions */}
      <div className="w-7 shrink-0 flex justify-end">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="hidden rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-600 group-hover:flex"
        >
          <MoreHorizontal size={13} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-4 top-8 z-20 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Move to group</p>
            <button type="button"
              onClick={() => { onMove(doc.id, null); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <BookOpen size={11} /> No group
            </button>
            {groups.filter((g) => g.id !== doc.group_id).map((g) => (
              <button key={g.id} type="button"
                onClick={() => { onMove(doc.id, g.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                <span className={cn('h-2 w-2 rounded-full', colorOf(g).dot)} />
                {g.name}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button type="button"
              onClick={() => { onDelete(doc.id, doc.name); setMenuOpen(false); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────
function SearchResultRow({ result, group, query, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border p-3.5 text-left transition-all',
        active
          ? 'border-blue-300 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', fileMeta(result.file_type).bg)}>
          <FileTypeIcon type={result.file_type} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">
              <HighlightName text={result.name} query={query} />
            </p>
            {group && (
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', colorOf(group).pill)}>
                {group.name}
              </span>
            )}
            <FileTypeBadge type={result.file_type} />
            <span className="ml-auto text-[10px] text-slate-300">{fmtDate(result.created_at)}</span>
          </div>
          {result.headline && (
            <div className="mt-1.5 space-y-0.5">
              {result.headline.split(' … ').filter(Boolean).map((frag, i) => (
                <p key={i} className="flex items-start gap-1">
                  <span className="mt-0.5 text-slate-300">›</span>
                  <HighlightedSnippet text={frag} />
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Document viewer drawer ────────────────────────────────────────────────────
function DocumentViewer({ doc, onClose, getSignedUrl, width }) {
  const [url,          setUrl]          = useState(null);
  const [content,      setContent]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [signedUrl,    setSignedUrl]    = useState(null); // always set; used for download

  useEffect(() => {
    if (!doc) return;
    setUrl(null); setContent(null); setSignedUrl(null); setLoading(true);

    (async () => {
      const signed = await getSignedUrl(doc.file_path);
      if (!signed) { setLoading(false); return; }
      setSignedUrl(signed);

      if (doc.file_type === 'pdf') {
        setUrl(signed);
      } else if (doc.file_type === 'html' || doc.file_type === 'txt' || doc.file_type === 'md') {
        // Fetch text client-side so we control rendering; avoids Supabase
        // serving files as attachments or with wrong Content-Type.
        try {
          const res = await fetch(signed);
          setContent(await res.text());
        } catch { setContent(null); }
      } else {
        setUrl(signed);
      }
      setLoading(false);
    })();
  }, [doc?.id]);

  const handleDownload = async () => {
    if (!signedUrl) return;
    try {
      const res  = await fetch(signedUrl);
      const blob = await res.blob();
      const obj  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: obj, download: doc.name });
      a.click();
      URL.revokeObjectURL(obj);
    } catch {}
  };

  if (!doc) return null;

  return (
    <div className="flex shrink-0 flex-col border-l border-slate-200 bg-white" style={{ width }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', fileMeta(doc.file_type).bg)}>
          <FileTypeIcon type={doc.file_type} size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{doc.name}</p>
          <p className="text-[10px] text-slate-400">{fmtDate(doc.created_at)} · {fmtSize(doc.file_size)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {signedUrl && (
            <button type="button" onClick={handleDownload} title="Download"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <Download size={14} />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-300" />
          </div>
        ) : doc.file_type === 'pdf' && url ? (
          <iframe src={url} className="h-full w-full border-0" title={doc.name} />
        ) : doc.file_type === 'html' && content != null ? (
          <iframe
            srcDoc={content}
            sandbox="allow-same-origin allow-popups"
            className="h-full w-full border-0"
            title={doc.name}
          />
        ) : (doc.file_type === 'txt' || doc.file_type === 'md') && content != null ? (
          <div className="h-full overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">{content}</pre>
          </div>
        ) : content != null ? (
          <div className="h-full overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">{content}</pre>
          </div>
        ) : url ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <File size={32} className="text-slate-200" />
            <p className="text-sm">Preview not available for this file type.</p>
            <button type="button" onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600">
              <Download size={13} /> Download to view
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">
            No file attached
          </div>
        )}
      </div>
    </div>
  );
}

// ── Document editor modal ─────────────────────────────────────────────────────
const EDITOR_STYLES = `
  .kb-editor { font-size: 14px; line-height: 1.65; color: #1e293b; }
  .kb-editor:focus { outline: none; }
  .kb-editor:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
  .kb-editor h1 { font-size: 1.75em; font-weight: 700; margin: 0.75em 0 0.25em; }
  .kb-editor h2 { font-size: 1.4em;  font-weight: 600; margin: 0.75em 0 0.25em; }
  .kb-editor h3 { font-size: 1.2em;  font-weight: 600; margin: 0.75em 0 0.25em; }
  .kb-editor p  { margin: 0.4em 0; min-height: 1.4em; }
  .kb-editor ul { list-style: disc;    padding-left: 1.75em; margin: 0.4em 0; }
  .kb-editor ol { list-style: decimal; padding-left: 1.75em; margin: 0.4em 0; }
  .kb-editor li { margin: 0.15em 0; }
  .kb-editor blockquote { border-left: 3px solid #94a3b8; padding-left: 1em; color: #64748b; margin: 0.75em 0; font-style: italic; }
  .kb-editor a   { color: #2563eb; text-decoration: underline; }
  .kb-editor code { background: #f1f5f9; padding: 0.1em 0.35em; border-radius: 3px; font-family: monospace; font-size: 0.88em; }
  .kb-editor pre  { background: #f1f5f9; padding: 1em; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 0.85em; margin: 0.5em 0; }
  .kb-editor img  { max-width: 100%; height: auto; border-radius: 6px; margin: 0.5em 0; }
  .kb-editor hr   { border: none; border-top: 1px solid #e2e8f0; margin: 1em 0; }
`;

function TBtn({ label, title, onMouseDown, className, icon: Icon }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className={cn(
        'flex h-7 min-w-[1.75rem] items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900',
        className
      )}
    >
      {Icon ? <Icon size={13} /> : label}
    </button>
  );
}

function CreateDocumentModal({ groups, activeGroup, onCreate, onClose }) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [groupId,     setGroupId]     = useState(activeGroup ?? '');
  const [mode,        setMode]        = useState('rich'); // 'rich' | 'html'
  const [htmlSource,  setHtmlSource]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const editorRef = useRef(null);

  const exec = useCallback((cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  const switchMode = (next) => {
    if (next === 'html') {
      setHtmlSource(editorRef.current?.innerHTML ?? '');
    } else if (next === 'rich' && editorRef.current) {
      editorRef.current.innerHTML = htmlSource;
    }
    setMode(next);
  };

  const insertLink = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? '';
    const url = window.prompt('URL:', 'https://');
    if (url) exec('createLink', url);
  };

  const getHtml = () => mode === 'rich' ? (editorRef.current?.innerHTML ?? '') : htmlSource;

  const save = async () => {
    const html = getHtml();
    if (!name.trim() && !html.replace(/<[^>]*>/g, '').trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim() || 'Untitled', description: description.trim(), groupId, html });
      onClose();
    } catch { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <style>{EDITOR_STYLES}</style>

      <div className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FilePlus size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">New Document</h2>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {/* Fields */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-2.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document title"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-300 placeholder:font-normal"
          />
          {groups.length > 0 && (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
            >
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <TBtn label="B"  title="Bold"      className="font-bold"   onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} />
          <TBtn label="I"  title="Italic"    className="italic"      onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} />
          <TBtn label="U"  title="Underline" className="underline"   onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} />

          <span className="mx-1 h-5 w-px bg-slate-200" />

          <TBtn label="H1" title="Heading 1" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H1'); }} />
          <TBtn label="H2" title="Heading 2" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H2'); }} />
          <TBtn label="H3" title="Heading 3" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H3'); }} />
          <TBtn label="¶"  title="Paragraph" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'P'); }} />

          <span className="mx-1 h-5 w-px bg-slate-200" />

          <TBtn title="Bullet list"   icon={List}         onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} />
          <TBtn title="Numbered list" icon={ListOrdered}  onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }} />

          <span className="mx-1 h-5 w-px bg-slate-200" />

          <TBtn label="❝"  title="Block quote" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'BLOCKQUOTE'); }} />
          <TBtn title="Link" icon={Link2} onMouseDown={(e) => { e.preventDefault(); insertLink(); }} />

          <span className="mx-1 h-5 w-px bg-slate-200" />

          <TBtn label="×fmt" title="Remove formatting" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }} />

          {/* Mode toggle */}
          <div className="ml-auto flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            <button type="button" onClick={() => switchMode('rich')}
              className={cn('rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                mode === 'rich' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800')}>
              Rich
            </button>
            <button type="button" onClick={() => switchMode('html')}
              className={cn('rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                mode === 'html' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800')}>
              HTML
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {mode === 'rich' ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="kb-editor min-h-full"
              data-placeholder="Start typing your document… paste text, images, or HTML directly here."
            />
          ) : (
            <textarea
              value={htmlSource}
              onChange={(e) => setHtmlSource(e.target.value)}
              className="h-full min-h-[400px] w-full resize-none font-mono text-xs leading-relaxed text-slate-700 outline-none"
              placeholder="<h1>Title</h1><p>Paste or write HTML here…</p>"
            />
          )}
        </div>

        {/* Optional description */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional) — shown on document cards"
            className="w-full text-xs text-slate-500 outline-none placeholder:text-slate-300"
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FilePlus size={13} />}
            {saving ? 'Saving…' : 'Save Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Upload drop zone ──────────────────────────────────────────────────────────
function UploadZone({ groups, onUpload, onClose }) {
  const [dragging,  setDragging]  = useState(false);
  const [groupId,   setGroupId]   = useState('');
  const inputRef = useRef(null);

  const handle = useCallback((files) => {
    const valid = Array.from(files).filter((f) => f.size <= 52_428_800);
    if (valid.length) { onUpload(valid, groupId || null); onClose(); }
  }, [onUpload, onClose, groupId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Upload Documents</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        {groups.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-xs font-medium text-slate-600">Add to group:</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
            >
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed py-12 transition-all',
            dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          )}
        >
          <Upload size={28} className={dragging ? 'text-blue-500' : 'text-slate-300'} />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
            <p className="mt-1 text-xs text-slate-400">PDF, HTML, TXT, Markdown, Word · Max 50 MB per file</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.html,.htm,.txt,.md,.markdown,.docx,.doc"
          className="hidden"
          onChange={(e) => { handle(e.target.files); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function KnowledgeContent() {
  const { session, company } = useSession();
  const {
    groups, documents, loading, loadError, refresh, uploads,
    searchQuery, searchResults, searchLoading,
    search, uploadDocuments, createDocument,
    createGroup, updateGroup, deleteGroup,
    updateDocument, deleteDocument,
    getSignedUrl,
  } = useKnowledgeBase(session, company);

  const [activeGroup,   setActiveGroup]   = useState(null);
  const [activeTypeFilter, setTypeFilter] = useState(null);
  const [selectedDoc,   setSelectedDoc]   = useState(null);
  const [hoveredResult, setHoveredResult] = useState(0);
  const [uploadOpen,    setUploadOpen]    = useState(false);
  const [isDropTarget,  setIsDropTarget]  = useState(false);
  const [viewMode,      setViewMode]      = useState('cards'); // 'cards' | 'details'
  const [createOpen,    setCreateOpen]    = useState(false);
  const [drawerWidth,  setDrawerWidth]  = useState(420);
  const [isResizing,   setIsResizing]   = useState(false);
  const [confirmState, setConfirmState] = useState(null);

  const handleDeleteGroup = (id, name) => {
    setConfirmState({
      title: 'Delete group',
      message: `Delete group "${name}"? Documents will become ungrouped.`,
      onConfirm: () => deleteGroup(id),
    });
  };
  const handleDeleteDocument = (id, name) => {
    setConfirmState({
      title: 'Delete document',
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: () => deleteDocument(id),
    });
  };

  const searchRef = useRef(null);
  const dragRef   = useRef(null); // { startX, startWidth }

  const startResize = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: drawerWidth };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const delta = dragRef.current.startX - ev.clientX;
      setDrawerWidth(Math.min(900, Math.max(280, dragRef.current.startWidth + delta)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [drawerWidth]);

  // Close viewer when doc is deleted
  useEffect(() => {
    if (selectedDoc && !documents.find((d) => d.id === selectedDoc.id)) {
      setSelectedDoc(null);
    }
  }, [documents, selectedDoc]);

  const groupById = (id) => groups.find((g) => g.id === id);

  const docCounts = documents.reduce((acc, d) => {
    if (d.group_id) acc[d.group_id] = (acc[d.group_id] ?? 0) + 1;
    return acc;
  }, {});

  // Visible docs in browse mode
  const visibleDocs = documents.filter((d) => {
    if (activeGroup !== null && d.group_id !== activeGroup) return false;
    if (activeTypeFilter && d.file_type !== activeTypeFilter) return false;
    return true;
  });

  const isSearching = Boolean(searchQuery);
  const searchReady = isSearching && !searchLoading && searchResults !== null;

  // Keyboard navigation on search results
  const handleSearchKey = (e) => {
    if (!isSearching || !searchResults?.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoveredResult((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoveredResult((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = searchResults[hoveredResult];
      if (r) setSelectedDoc(documents.find((d) => d.id === r.id) ?? r);
    } else if (e.key === 'Escape') {
      search('');
      searchRef.current?.blur();
    }
  };

  useEffect(() => { setHoveredResult(0); }, [searchResults]);

  const uniqueTypes = [...new Set(documents.map((d) => d.file_type))];

  return (
    <div
      className="flex h-full overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setIsDropTarget(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDropTarget(false); }}
      onDrop={(e) => {
        e.preventDefault(); setIsDropTarget(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) uploadDocuments(files, activeGroup);
      }}
    >
      {loadError && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-lg shadow-lg">
            <ErrorBanner error={loadError} onRetry={refresh} />
          </div>
        </div>
      )}

      {/* Drag-capture overlay — sits above iframes during panel resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {/* Drop overlay */}
      {isDropTarget && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/70 backdrop-blur-sm">
          <div className="text-center">
            <Upload size={40} className="mx-auto text-blue-400" />
            <p className="mt-2 text-sm font-semibold text-blue-700">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Groups sidebar */}
      <GroupsSidebar
        groups={groups}
        activeGroup={activeGroup}
        onSelect={setActiveGroup}
        onCreate={createGroup}
        onUpdate={updateGroup}
        onDelete={handleDeleteGroup}
        docCounts={docCounts}
      />

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => search(e.target.value, { groupId: activeGroup, fileType: activeTypeFilter })}
              onKeyDown={handleSearchKey}
              placeholder="Search documents, processes, procedures…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-10 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-400"
            />
            {searchLoading && (
              <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-400" />
            )}
            {searchQuery && !searchLoading && (
              <button type="button" onClick={() => search('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X size={13} />
              </button>
            )}
          </div>

          {/* File type filter chips */}
          {uniqueTypes.length > 1 && !isSearching && (
            <div className="flex items-center gap-1">
              {uniqueTypes.map((t) => {
                const { label, cls, bg } = fileMeta(t);
                const active = activeTypeFilter === t;
                return (
                  <button key={t} type="button"
                    onClick={() => setTypeFilter(active ? null : t)}
                    className={cn('rounded-lg border px-2 py-1 text-[11px] font-medium transition-all',
                      active ? cn(cls, bg, 'border-current') : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    )}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* View toggle */}
          <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              title="Card view"
              onClick={() => setViewMode('cards')}
              className={cn('rounded p-1.5 transition-colors',
                viewMode === 'cards'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600')}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              title="Details view"
              onClick={() => setViewMode('details')}
              className={cn('rounded p-1.5 transition-colors',
                viewMode === 'details'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600')}
            >
              <List size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <FilePlus size={14} /> New
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600"
          >
            <Upload size={14} /> Upload
          </button>
        </div>

        {/* Content area */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {isSearching ? (
              /* ── Search results ── */
              <div className="space-y-2">
                {searchLoading && !searchResults ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-slate-300" />
                  </div>
                ) : searchResults?.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                    <Search size={28} className="text-slate-200" />
                    <p className="text-sm">No documents match <span className="font-medium">"{searchQuery}"</span></p>
                    <p className="text-xs text-slate-300">Try different keywords or upload new documents</p>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-xs font-medium text-slate-400">
                      {searchResults?.length ?? 0} result{searchResults?.length !== 1 ? 's' : ''} for <span className="text-slate-600">"{searchQuery}"</span>
                    </p>
                    {(searchResults ?? []).map((r, i) => (
                      <SearchResultRow
                        key={r.id}
                        result={r}
                        group={groupById(r.group_id)}
                        query={searchQuery}
                        active={i === hoveredResult}
                        onClick={() => {
                          setHoveredResult(i);
                          setSelectedDoc(documents.find((d) => d.id === r.id) ?? r);
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            ) : (
              /* ── Browse mode ── */
              <>
                {/* Upload progress ghost cards */}
                {Object.entries(uploads).length > 0 && (
                  <div className={cn('mb-4', viewMode === 'cards'
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3'
                    : 'space-y-1'
                  )}>
                    {Object.entries(uploads).map(([uid, u]) => (
                      <UploadProgressCard key={uid} {...u} />
                    ))}
                  </div>
                )}

                {loading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-slate-300" />
                  </div>
                ) : visibleDocs.length === 0 ? (
                  <div
                    className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400"
                    onClick={() => setUploadOpen(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    <BookOpen size={32} className="text-slate-200" />
                    <p className="text-sm font-medium">No documents yet</p>
                    <p className="text-xs text-slate-300">Drop files anywhere or click Upload to get started</p>
                  </div>
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {visibleDocs.map((doc) => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        group={groupById(doc.group_id)}
                        groups={groups}
                        onClick={() => setSelectedDoc(doc)}
                        onDelete={handleDeleteDocument}
                        onMove={(id, gid) => updateDocument(id, { group_id: gid })}
                      />
                    ))}
                  </div>
                ) : (
                  /* Details view */
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Header row */}
                    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
                      <div className="w-7 shrink-0" />
                      <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</p>
                      <p className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Group</p>
                      <p className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</p>
                      <p className="w-16 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Size</p>
                      <p className="w-28 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
                      <div className="w-7 shrink-0" />
                    </div>
                    {visibleDocs.map((doc) => (
                      <DocRow
                        key={doc.id}
                        doc={doc}
                        group={groupById(doc.group_id)}
                        groups={groups}
                        onClick={() => setSelectedDoc(doc)}
                        onDelete={handleDeleteDocument}
                        onMove={(id, gid) => updateDocument(id, { group_id: gid })}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resize handle + document viewer */}
          {selectedDoc && (
            <>
              <div
                onMouseDown={startResize}
                className="group relative w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400"
              >
                {/* Centre pip */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="block h-1 w-1 rounded-full bg-white" />
                  <span className="block h-1 w-1 rounded-full bg-white" />
                  <span className="block h-1 w-1 rounded-full bg-white" />
                </div>
              </div>
              <DocumentViewer
                doc={selectedDoc}
                onClose={() => setSelectedDoc(null)}
                getSignedUrl={getSignedUrl}
                width={drawerWidth}
              />
            </>
          )}
        </div>
      </div>

      {/* Upload modal */}
      {uploadOpen && (
        <UploadZone
          groups={groups}
          onUpload={uploadDocuments}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {/* Create document modal */}
      {createOpen && (
        <CreateDocumentModal
          groups={groups}
          activeGroup={activeGroup}
          onCreate={createDocument}
          onClose={() => setCreateOpen(false)}
        />
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

export default function KnowledgeBasePage() {
  return (
    <AuthGuard>
      <OSShell>
        <KnowledgeContent />
      </OSShell>
    </AuthGuard>
  );
}
