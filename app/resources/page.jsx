'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search, Upload, FileText, Video, Link2, BookOpen, Layers, Trash2,
  ExternalLink, Download, Plus, Loader2, File, X, MoreHorizontal,
  AlertCircle, LayoutGrid, List, FilePlus, ListOrdered, Code2,
  Hash, AlignLeft, GraduationCap, ChevronRight,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useResources } from '@/hooks/useResources';
import { getSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';

// ── File-type metadata (for uploaded/created files) ───────────────────────
const FILE_META = {
  pdf:  { label: 'PDF',  icon: FileText,  cls: 'text-red-500',    bg: 'bg-red-50'    },
  html: { label: 'HTML', icon: Code2,     cls: 'text-orange-500', bg: 'bg-orange-50' },
  md:   { label: 'MD',   icon: Hash,      cls: 'text-violet-500', bg: 'bg-violet-50' },
  docx: { label: 'DOCX', icon: FileText,  cls: 'text-blue-500',   bg: 'bg-blue-50'   },
  doc:  { label: 'DOC',  icon: FileText,  cls: 'text-blue-400',   bg: 'bg-blue-50'   },
  txt:  { label: 'TXT',  icon: AlignLeft, cls: 'text-slate-500',  bg: 'bg-slate-100' },
};

// ── Resource-type metadata (semantic type: guide/video/etc.) ──────────────
const RESOURCE_TYPE = {
  guide:    { label: 'Guide',    icon: BookOpen, cls: 'text-blue-600',    bg: 'bg-blue-50'    },
  doc:      { label: 'Document', icon: FileText, cls: 'text-slate-600',   bg: 'bg-slate-100'  },
  video:    { label: 'Video',    icon: Video,    cls: 'text-violet-600',  bg: 'bg-violet-50'  },
  template: { label: 'Template', icon: Layers,   cls: 'text-emerald-600', bg: 'bg-emerald-50' },
  link:     { label: 'Link',     icon: Link2,    cls: 'text-amber-600',   bg: 'bg-amber-50'   },
};

function fileMeta(ft)   { return FILE_META[ft] ?? { label: (ft ?? 'FILE').toUpperCase(), icon: File, cls: 'text-slate-400', bg: 'bg-slate-100' }; }
function resourceType(t){ return RESOURCE_TYPE[t] ?? RESOURCE_TYPE.doc; }

// Primary display icon for a resource: file-type if it has a file, else resource-type
function primaryMeta(r) {
  return r.file_path ? fileMeta(r.file_type) : resourceType(r.type);
}

function FileTypeBadge({ fileType }) {
  if (!fileType) return null;
  const { label, cls, bg } = fileMeta(fileType);
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls, bg)}>{label}</span>;
}

function ResourceTypeBadge({ type }) {
  const { label } = resourceType(type);
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{label}</span>;
}

function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}


// ── Highlighted search snippet (ts_headline uses ⟦⟧ delimiters) ───────────
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

// ── Categories sidebar ────────────────────────────────────────────────────
function CategoriesSidebar({ categories, activeCategory, onSelect, catCounts, total }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <BookOpen size={15} className="text-blue-600" />
        <span className="text-sm font-semibold text-slate-800">Resources</span>
      </div>
      {/* Resources > Training */}
      <Link href="/resources/training"
        className="group flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700">
        <GraduationCap size={15} className="text-slate-400 group-hover:text-blue-600" />
        <span className="flex-1">Training</span>
        <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500" />
      </Link>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <button type="button" onClick={() => onSelect(null)}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
            activeCategory === null
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-slate-600 hover:bg-white hover:text-slate-800')}>
          <BookOpen size={14} className="shrink-0" />
          <span className="flex-1 text-left">All Resources</span>
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">{total}</span>
        </button>

        {categories.length > 0 && <div className="my-1.5 border-t border-slate-200" />}

        {categories.map((cat) => (
          <button key={cat} type="button" onClick={() => onSelect(cat)}
            className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
              activeCategory === cat
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-slate-600 hover:bg-white hover:text-slate-800')}>
            <span className="flex-1 truncate text-left">{cat}</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
              {catCounts[cat] ?? 0}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── Upload progress card ──────────────────────────────────────────────────
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
            <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-slate-400 capitalize">{status}…</p>
        </>
      )}
    </div>
  );
}

// ── Resource card (grid view) ─────────────────────────────────────────────
function ResourceCard({ resource: r, onClick, onDelete, onMove, categories }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { icon: Icon, cls, bg } = primaryMeta(r);
  const hasFile = Boolean(r.file_path);
  const hasUrl  = Boolean(r.url);

  return (
    <div
      className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg)}>
          <Icon size={18} className={cls} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {r.category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{r.category}</span>
            )}
            <ResourceTypeBadge type={r.type} />
            {hasFile && <FileTypeBadge fileType={r.file_type} />}
          </div>
        </div>

        <button type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="hidden rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 group-hover:flex">
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-10 z-20 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setMenuOpen(false)}>
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Move to category</p>
            {categories.filter((c) => c !== r.category).map((c) => (
              <button key={c} type="button"
                onClick={() => { onMove(r.id, c); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                {c}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button type="button"
              onClick={() => { onDelete(r.id, r.title); setMenuOpen(false); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
      </div>

      {r.description && <p className="line-clamp-2 text-xs text-slate-400">{r.description}</p>}

      <div className="mt-auto flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[10px] text-slate-300">
          <span>{fmtDate(r.created_at)}</span>
          {r.file_size && <span>· {fmtSize(r.file_size)}</span>}
        </div>
        {hasUrl && (
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            <ExternalLink size={11} /> Open
          </a>
        )}
      </div>
    </div>
  );
}

// ── Resource row (details view) ───────────────────────────────────────────
function ResourceRow({ resource: r, onClick, onDelete, onMove, categories }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { icon: Icon, cls, bg } = primaryMeta(r);
  const hasUrl = Boolean(r.url);

  return (
    <div className="group relative flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 transition-colors hover:bg-slate-50 last:border-b-0"
      onClick={onClick}>
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon size={14} className={cls} />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.title}</p>
      <div className="w-28 shrink-0">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 truncate">{r.category}</span>
      </div>
      <div className="w-20 shrink-0 flex gap-1">
        <ResourceTypeBadge type={r.type} />
        {r.file_type && <FileTypeBadge fileType={r.file_type} />}
      </div>
      <p className="w-16 shrink-0 text-right text-xs text-slate-400 tabular-nums">{fmtSize(r.file_size) || '—'}</p>
      <p className="w-28 shrink-0 text-right text-xs text-slate-400 tabular-nums">{fmtDate(r.created_at)}</p>
      <div className="w-14 shrink-0 flex items-center justify-end gap-1">
        {hasUrl && (
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-blue-400 hover:text-blue-600 hidden group-hover:flex">
            <ExternalLink size={13} />
          </a>
        )}
        <button type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="hidden rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-600 group-hover:flex">
          <MoreHorizontal size={13} />
        </button>
        {menuOpen && (
          <div className="absolute right-4 top-8 z-20 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setMenuOpen(false)}>
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Move to category</p>
            {categories.filter((c) => c !== r.category).map((c) => (
              <button key={c} type="button"
                onClick={() => { onMove(r.id, c); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                {c}
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button type="button"
              onClick={() => { onDelete(r.id, r.title); setMenuOpen(false); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">
              <Trash2 size={11} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Search result row ─────────────────────────────────────────────────────
function SearchResultRow({ result: r, query, active, onClick }) {
  const { icon: Icon, cls, bg } = primaryMeta(r);
  const hasUrl = Boolean(r.url);
  return (
    <button type="button" onClick={onClick}
      className={cn('w-full rounded-xl border p-3.5 text-left transition-all',
        active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50')}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>
          <Icon size={15} className={cls} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">
              <HighlightName text={r.title} query={query} />
            </p>
            {r.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{r.category}</span>}
            <ResourceTypeBadge type={r.type} />
            {r.file_type && <FileTypeBadge fileType={r.file_type} />}
            {hasUrl && (
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto flex items-center gap-1 text-[10px] text-blue-500 hover:underline">
                <ExternalLink size={10} /> Open
              </a>
            )}
            <span className="text-[10px] text-slate-300">{fmtDate(r.created_at)}</span>
          </div>
          {r.headline && (
            <div className="mt-1.5 space-y-0.5">
              {r.headline.split(' … ').filter(Boolean).map((frag, i) => (
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

// ── Freeform content_text renderer (plain text; blank-line paragraphs, "- "
// lines become a bullet list, short lines ending in ":" become sub-headings).
function ResourceContentText({ text }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean);
        const isList = lines.length > 1 && lines.every((l) => l.trim().startsWith('- '));
        if (isList) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.trim().replace(/^- /, '')}</li>)}
            </ul>
          );
        }
        if (lines.length === 1 && lines[0].trim().endsWith(':') && lines[0].length < 60) {
          return <p key={i} className="pt-1 text-sm font-semibold text-slate-800">{lines[0]}</p>;
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

// ── Resource detail drawer ────────────────────────────────────────────────
// Shows full metadata (category, type, description) plus whichever content
// the resource actually has: an uploaded-file preview, freeform content_text,
// or an external link — instead of only rendering when a file is attached.
function DocumentViewer({ resource: r, onClose, getSignedUrl, width }) {
  const [url,         setUrl]         = useState(null);
  const [content,     setContent]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [signedUrl,   setSignedUrl]   = useState(null);

  const hasFile = Boolean(r?.file_path);
  const hasUrl  = Boolean(r?.url);

  useEffect(() => {
    if (!r) return;
    setUrl(null); setContent(null); setSignedUrl(null);
    if (!hasFile) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      const signed = await getSignedUrl(r.file_path);
      if (!signed) { setLoading(false); return; }
      setSignedUrl(signed);

      if (r.file_type === 'pdf') {
        setUrl(signed);
      } else if (['html', 'txt', 'md'].includes(r.file_type)) {
        try { setContent(await (await fetch(signed)).text()); } catch { setContent(null); }
      } else {
        setUrl(signed);
      }
      setLoading(false);
    })();
  }, [r?.id, hasFile]);

  const handleDownload = async () => {
    if (!signedUrl) return;
    try {
      const blob = await (await fetch(signedUrl)).blob();
      const obj  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: obj, download: r.title }).click();
      URL.revokeObjectURL(obj);
    } catch {}
  };

  if (!r) return null;
  const { icon: Icon, cls, bg } = primaryMeta(r);

  return (
    <div className="flex shrink-0 flex-col border-l border-slate-200 bg-white" style={{ width }}>
      <div className="flex items-start gap-2.5 border-b border-slate-200 px-4 py-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>
          <Icon size={16} className={cls} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{r.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {r.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{r.category}</span>}
            <ResourceTypeBadge type={r.type} />
            {hasFile && <FileTypeBadge fileType={r.file_type} />}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {fmtDate(r.created_at)}
            {r.updated_at && r.updated_at !== r.created_at ? ` · updated ${fmtDate(r.updated_at)}` : ''}
            {hasFile && r.file_size ? ` · ${fmtSize(r.file_size)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasUrl && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open link"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
              <ExternalLink size={14} />
            </a>
          )}
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

      {r.description && (
        <p className="shrink-0 border-b border-slate-100 px-4 py-2.5 text-xs leading-relaxed text-slate-500">{r.description}</p>
      )}

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-300" />
          </div>
        ) : hasFile && r.file_type === 'pdf' && url ? (
          <iframe src={url} className="h-full w-full border-0" title={r.title} />
        ) : hasFile && r.file_type === 'html' && content != null ? (
          <iframe srcDoc={content} sandbox="allow-same-origin allow-popups" className="h-full w-full border-0" title={r.title} />
        ) : hasFile && content != null ? (
          <div className="h-full overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">{content}</pre>
          </div>
        ) : hasFile && url ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <File size={32} className="text-slate-200" />
            <p className="text-sm">Preview not available.</p>
            <button type="button" onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600">
              <Download size={13} /> Download to view
            </button>
          </div>
        ) : r.content_text ? (
          <div className="h-full overflow-y-auto p-5">
            <ResourceContentText text={r.content_text} />
          </div>
        ) : hasUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
            <Link2 size={28} className="text-slate-200" />
            <p className="break-all text-xs text-slate-400">{r.url}</p>
            <a href={r.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:border-blue-300 hover:bg-blue-50">
              <ExternalLink size={13} /> Open Link
            </a>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">No additional details yet</div>
        )}
      </div>
    </div>
  );
}

// ── Upload modal ──────────────────────────────────────────────────────────
function UploadZone({ existingCategories, onUpload, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [category, setCategory] = useState('General');
  const [type,     setType]     = useState('doc');
  const inputRef = useRef(null);

  const handle = useCallback((files) => {
    const valid = Array.from(files).filter((f) => f.size <= 52_428_800);
    if (valid.length) { onUpload(valid, { category, type }); onClose(); }
  }, [onUpload, onClose, category, type]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}>
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Upload Documents</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <input
              list="upload-cats"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="General"
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <datalist id="upload-cats">
              {existingCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400">
              <option value="guide">Guide</option>
              <option value="doc">Document</option>
              <option value="template">Template</option>
              <option value="link">Link</option>
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn('flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed py-10 transition-all',
            dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50')}>
          <Upload size={26} className={dragging ? 'text-blue-500' : 'text-slate-300'} />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
            <p className="mt-0.5 text-xs text-slate-400">PDF, HTML, TXT, Markdown, Word · Max 50 MB</p>
          </div>
        </div>
        <input ref={inputRef} type="file" multiple
          accept=".pdf,.html,.htm,.txt,.md,.markdown,.docx,.doc"
          className="hidden"
          onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ── Rich-text document editor modal ───────────────────────────────────────
const EDITOR_STYLES = `
  .res-editor { font-size: 14px; line-height: 1.65; color: #1e293b; }
  .res-editor:focus { outline: none; }
  .res-editor:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
  .res-editor h1 { font-size: 1.75em; font-weight: 700; margin: 0.75em 0 0.25em; }
  .res-editor h2 { font-size: 1.4em;  font-weight: 600; margin: 0.75em 0 0.25em; }
  .res-editor h3 { font-size: 1.2em;  font-weight: 600; margin: 0.75em 0 0.25em; }
  .res-editor p  { margin: 0.4em 0; min-height: 1.4em; }
  .res-editor ul { list-style: disc;    padding-left: 1.75em; margin: 0.4em 0; }
  .res-editor ol { list-style: decimal; padding-left: 1.75em; margin: 0.4em 0; }
  .res-editor li { margin: 0.15em 0; }
  .res-editor blockquote { border-left: 3px solid #94a3b8; padding-left: 1em; color: #64748b; margin: 0.75em 0; font-style: italic; }
  .res-editor a   { color: #2563eb; text-decoration: underline; }
  .res-editor code { background: #f1f5f9; padding: 0.1em 0.35em; border-radius: 3px; font-family: monospace; font-size: 0.88em; }
  .res-editor pre  { background: #f1f5f9; padding: 1em; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 0.85em; margin: 0.5em 0; }
  .res-editor img  { max-width: 100%; height: auto; border-radius: 6px; margin: 0.5em 0; }
`;

function TBtn({ label, title, onMouseDown, className, icon: Icon }) {
  return (
    <button type="button" title={title} onMouseDown={onMouseDown}
      className={cn('flex h-7 min-w-[1.75rem] items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900', className)}>
      {Icon ? <Icon size={13} /> : label}
    </button>
  );
}

function CreateDocumentModal({ existingCategories, onCreate, onClose }) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState('General');
  const [type,        setType]        = useState('doc');
  const [mode,        setMode]        = useState('rich');
  const [htmlSource,  setHtmlSource]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const editorRef = useRef(null);

  const exec = useCallback((cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }, []);

  const switchMode = (next) => {
    if (next === 'html') setHtmlSource(editorRef.current?.innerHTML ?? '');
    else if (next === 'rich' && editorRef.current) editorRef.current.innerHTML = htmlSource;
    setMode(next);
  };

  const save = async () => {
    const html = mode === 'rich' ? (editorRef.current?.innerHTML ?? '') : htmlSource;
    if (!name.trim() && !html.replace(/<[^>]*>/g, '').trim()) return;
    setSaving(true);
    try {
      await onCreate({ title: name.trim() || 'Untitled', description: description.trim(), category, type, html });
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
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {/* Fields */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Document title"
            className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-300 placeholder:font-normal" />
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400">
            <option value="guide">Guide</option>
            <option value="doc">Document</option>
            <option value="template">Template</option>
          </select>
          <div className="relative">
            <input list="doc-cats" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400 w-36" />
            <datalist id="doc-cats">
              {existingCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <TBtn label="B"  title="Bold"      className="font-bold"  onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} />
          <TBtn label="I"  title="Italic"    className="italic"     onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} />
          <TBtn label="U"  title="Underline" className="underline"  onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <TBtn label="H1" title="Heading 1" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H1'); }} />
          <TBtn label="H2" title="Heading 2" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H2'); }} />
          <TBtn label="H3" title="Heading 3" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'H3'); }} />
          <TBtn label="¶"  title="Paragraph" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'P'); }} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <TBtn title="Bullet list"   icon={List}         onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} />
          <TBtn title="Numbered list" icon={ListOrdered}  onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <TBtn label="❝" title="Block quote" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'BLOCKQUOTE'); }} />
          <TBtn title="Link" icon={Link2} onMouseDown={(e) => {
            e.preventDefault();
            const url = window.prompt('URL:', 'https://');
            if (url) exec('createLink', url);
          }} />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <TBtn label="×fmt" title="Remove formatting" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }} />

          <div className="ml-auto flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            {['rich', 'html'].map((m) => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                  mode === m ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)]' : 'text-slate-500 hover:text-slate-800')}>
                {m === 'rich' ? 'Rich' : 'HTML'}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {mode === 'rich' ? (
            <div ref={editorRef} contentEditable suppressContentEditableWarning
              className="res-editor min-h-full"
              data-placeholder="Start typing… paste text, images, or HTML." />
          ) : (
            <textarea value={htmlSource} onChange={(e) => setHtmlSource(e.target.value)}
              className="h-full min-h-[400px] w-full resize-none font-mono text-xs leading-relaxed text-slate-700 outline-none"
              placeholder="<h1>Title</h1><p>Paste or write HTML here…</p>" />
          )}
        </div>

        {/* Description */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full text-xs text-slate-500 outline-none placeholder:text-slate-300" />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
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

// ── Add Link modal (URL-based resources) ──────────────────────────────────
function AddLinkModal({ existingCategories, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', type: 'guide', category: 'General', url: '' });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({ title: form.title.trim(), description: form.description.trim() || null, type: form.type, category: form.category.trim() || 'General', url: form.url.trim() || null });
      onClose();
    } catch (ex) { setErr(ex.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Add Resource</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Title *</label>
              <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)}
                placeholder="Wi-Fi Site Survey Guide" required
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Type</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-blue-500">
                <option value="guide">Guide</option>
                <option value="doc">Document</option>
                <option value="video">Video</option>
                <option value="template">Template</option>
                <option value="link">Link</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Category</label>
              <input list="link-cats" value={form.category} onChange={(e) => set('category', e.target.value)}
                placeholder="Type or choose…"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
              <datalist id="link-cats">
                {existingCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">URL</label>
              <input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
                placeholder="Brief description…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Add Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
function ResourcesContent() {
  const { session, company, user } = useSession();
  const {
    resources, loading, loadError, refresh, uploads,
    searchQuery, searchResults, searchLoading,
    search, uploadDocuments, createDocument, createResource,
    updateResource, deleteResource, getSignedUrl,
  } = useResources(session, company, user);

  const [activeCategory, setActiveCategory] = useState(null);
  const [activeType,     setActiveType]     = useState(null);
  const [selectedItem,   setSelectedItem]   = useState(null);
  const [hoveredResult,  setHoveredResult]  = useState(0);
  const [viewMode,       setViewMode]       = useState('cards');
  const [uploadOpen,     setUploadOpen]     = useState(false);
  const [createOpen,     setCreateOpen]     = useState(false);
  const [addLinkOpen,    setAddLinkOpen]    = useState(false);
  const [isDropTarget,   setIsDropTarget]   = useState(false);
  const [drawerWidth,    setDrawerWidth]    = useState(460);
  const [isResizing,     setIsResizing]     = useState(false);
  const [confirmState,   setConfirmState]   = useState(null);
  const [toast,          setToast]          = useState(null);

  const handleDeleteResource = async (id, title) => {
    // Warn when this resource is a training course item (0058) — deleting
    // it cascade-removes those items and any completions on them.
    let usedIn = 0;
    const sb = getSupabase();
    if (sb) {
      const { count } = await sb.from('training_course_items')
        .select('id', { count: 'exact', head: true }).eq('resource_id', id);
      usedIn = count ?? 0;
    }
    setConfirmState({
      title: 'Delete resource',
      message: usedIn > 0
        ? `"${title}" is used in ${usedIn} training course${usedIn !== 1 ? 's' : ''}. Deleting it removes it from those courses (and any completion of it). This cannot be undone.`
        : `Delete "${title}"? This cannot be undone.`,
      onConfirm: () => deleteResource(id),
    });
  };

  const searchRef = useRef(null);
  const dragRef   = useRef(null);

  // Close viewer when resource is deleted
  useEffect(() => {
    if (selectedItem && !resources.find((r) => r.id === selectedItem.id)) setSelectedItem(null);
  }, [resources, selectedItem]);

  const categories   = [...new Set(resources.map((r) => r.category).filter(Boolean))].sort();
  const catCounts    = resources.reduce((acc, r) => { if (r.category) acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; }, {});
  const uniqueTypes  = [...new Set(resources.map((r) => r.type).filter(Boolean))];

  const visibleResources = resources.filter((r) => {
    if (activeCategory !== null && r.category !== activeCategory) return false;
    if (activeType     !== null && r.type     !== activeType)     return false;
    return true;
  });

  const isSearching = Boolean(searchQuery);

  // Keyboard navigation
  const handleSearchKey = (e) => {
    if (!isSearching || !searchResults?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHoveredResult((i) => Math.min(i + 1, searchResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHoveredResult((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = searchResults[hoveredResult]; if (r) setSelectedItem(resources.find((x) => x.id === r.id) ?? r); }
    else if (e.key === 'Escape') { search(''); searchRef.current?.blur(); }
  };
  useEffect(() => { setHoveredResult(0); }, [searchResults]);

  // Panel resize
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

  return (
    <div className="flex h-full overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setIsDropTarget(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDropTarget(false); }}
      onDrop={(e) => {
        e.preventDefault(); setIsDropTarget(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) uploadDocuments(files, { category: activeCategory || 'General' });
      }}>

      {loadError && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-lg shadow-lg">
            <ErrorBanner error={loadError} onRetry={refresh} />
          </div>
        </div>
      )}

      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {isDropTarget && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/70 backdrop-blur-sm">
          <div className="text-center">
            <Upload size={40} className="mx-auto text-blue-400" />
            <p className="mt-2 text-sm font-semibold text-blue-700">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Categories sidebar */}
      <CategoriesSidebar
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        catCounts={catCounts}
        total={resources.length}
      />

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} type="text" value={searchQuery}
              onChange={(e) => search(e.target.value, { category: activeCategory, type: activeType })}
              onKeyDown={handleSearchKey}
              placeholder="Search resources, guides, documents…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-400" />
            {searchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-400" />}
            {searchQuery && !searchLoading && (
              <button type="button" onClick={() => search('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>
            )}
          </div>

          {/* Type filters */}
          {uniqueTypes.length > 1 && !isSearching && (
            <div className="flex items-center gap-1">
              {uniqueTypes.map((t) => {
                const { label } = resourceType(t);
                const active = activeType === t;
                return (
                  <button key={t} type="button" onClick={() => setActiveType(active ? null : t)}
                    className={cn('rounded-lg border px-2 py-1 text-[11px] font-medium transition-all',
                      active ? 'border-transparent [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* View toggle */}
          <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {[['cards', LayoutGrid], ['details', List]].map(([mode, Icon]) => (
              <button key={mode} type="button" title={`${mode} view`} onClick={() => setViewMode(mode)}
                className={cn('rounded p-1.5 transition-colors',
                  viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
                <Icon size={14} />
              </button>
            ))}
          </div>

          {/* Actions */}
          <button type="button" onClick={() => setCreateOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <FilePlus size={14} /> New
          </button>
          <button type="button" onClick={() => setUploadOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
            <Upload size={14} /> Upload
          </button>
          <button type="button" onClick={() => setAddLinkOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600">
            <Plus size={14} /> Add Link
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {isSearching ? (
              /* Search results */
              <div className="space-y-2">
                {searchLoading && !searchResults ? (
                  <div className="flex h-40 items-center justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                ) : searchResults?.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                    <Search size={28} className="text-slate-200" />
                    <p className="text-sm">No results for <span className="font-medium">"{searchQuery}"</span></p>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-xs font-medium text-slate-400">
                      {searchResults?.length ?? 0} result{searchResults?.length !== 1 ? 's' : ''} for <span className="text-slate-600">"{searchQuery}"</span>
                    </p>
                    {(searchResults ?? []).map((r, i) => (
                      <SearchResultRow key={r.id} result={r} query={searchQuery} active={i === hoveredResult}
                        onClick={() => {
                          setHoveredResult(i);
                          setSelectedItem(resources.find((x) => x.id === r.id) ?? r);
                        }} />
                    ))}
                  </>
                )}
              </div>
            ) : (
              /* Browse mode */
              <>
                {/* Upload progress */}
                {Object.entries(uploads).length > 0 && (
                  <div className={cn('mb-4', viewMode === 'cards' ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3' : 'space-y-1')}>
                    {Object.entries(uploads).map(([uid, u]) => <UploadProgressCard key={uid} {...u} />)}
                  </div>
                )}

                {loading ? (
                  <div className="flex h-40 items-center justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
                ) : visibleResources.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 cursor-pointer"
                    onClick={() => setCreateOpen(true)}>
                    <BookOpen size={32} className="text-slate-200" />
                    <p className="text-sm font-medium">No resources yet</p>
                    <p className="text-xs text-slate-300">Click New to create a document or Upload to add files</p>
                  </div>
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                    {visibleResources.map((r) => (
                      <ResourceCard key={r.id} resource={r}
                        onClick={() => setSelectedItem(r)}
                        onDelete={handleDeleteResource}
                        onMove={(id, cat) => updateResource(id, { category: cat })}
                        categories={categories} />
                    ))}
                  </div>
                ) : (
                  /* Details view */
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
                      <div className="w-7 shrink-0" />
                      <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</p>
                      <p className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</p>
                      <p className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</p>
                      <p className="w-16 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Size</p>
                      <p className="w-28 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</p>
                      <div className="w-14 shrink-0" />
                    </div>
                    {visibleResources.map((r) => (
                      <ResourceRow key={r.id} resource={r}
                        onClick={() => setSelectedItem(r)}
                        onDelete={handleDeleteResource}
                        onMove={(id, cat) => updateResource(id, { category: cat })}
                        categories={categories} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resize handle + viewer */}
          {selectedItem && (
            <>
              <div onMouseDown={startResize}
                className="group relative w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-blue-400">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none">
                  {[0,1,2].map((i) => <span key={i} className="block h-1 w-1 rounded-full bg-white" />)}
                </div>
              </div>
              <DocumentViewer
                resource={selectedItem}
                onClose={() => setSelectedItem(null)}
                getSignedUrl={getSignedUrl}
                width={drawerWidth} />
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {uploadOpen && (
        <UploadZone existingCategories={categories} onUpload={(files, opts) => { uploadDocuments(files, opts); setToast({ type: 'success', message: `Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…` }); }} onClose={() => setUploadOpen(false)} />
      )}
      {createOpen && (
        <CreateDocumentModal existingCategories={categories} onCreate={createDocument} onClose={() => setCreateOpen(false)} />
      )}
      {addLinkOpen && (
        <AddLinkModal existingCategories={categories} onSave={async (d) => { await createResource(d); setToast({ type: 'success', message: 'Resource added.' }); }} onClose={() => setAddLinkOpen(false)} />
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function ResourcesPage() {
  return <AuthGuard><OSShell><ResourcesContent /></OSShell></AuthGuard>;
}
