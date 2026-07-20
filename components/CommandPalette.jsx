'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users, FolderKanban, CheckSquare, FileCheck, Receipt, LifeBuoy, BookOpen, Loader2 } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { cn } from '@/lib/utils';

const GROUPS = [
  { key: 'accounts',  label: 'CRM Accounts',    icon: Users,        href: (r) => `/crm/${r.id}`,               text: (r) => r.name },
  { key: 'projects',  label: 'Projects',        icon: FolderKanban, href: (r) => `/projects/${r.id}`,          text: (r) => r.name },
  { key: 'tasks',     label: 'Tasks',           icon: CheckSquare,  href: (r) => `/projects/${r.project_id}`,  text: (r) => r.title },
  { key: 'quotes',    label: 'Quotes',          icon: FileCheck,    href: (r) => `/builder?project=${r.id}`,   text: (r) => r.project_name },
  { key: 'invoices',  label: 'Invoices',        icon: Receipt,      href: () => `/invoices`,                    text: (r) => `${r.title} (${r.invoice_number})` },
  { key: 'tickets',   label: 'Support Cases', icon: LifeBuoy,     href: (r) => `/support/${r.id}`,           text: (r) => r.title },
  { key: 'resources', label: 'Resources',       icon: BookOpen,     href: () => `/resources`,                   text: (r) => r.title },
];

export default function CommandPalette() {
  const router = useRouter();
  const { configured, session, company } = useSession();
  const { results, loading, search, clear } = useGlobalSearch(company);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    clear();
  }, [clear]);

  // Cmd/Ctrl+K to open, Escape to close
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const onChange = (v) => {
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 250);
  };

  const goTo = (group, item) => {
    router.push(group.href(item));
    close();
  };

  if (!configured || !session) return null;

  const totalResults = results ? Object.values(results).reduce((s, arr) => s + arr.length, 0) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500"
      >
        <Search size={13} className="shrink-0" />
        <span className="flex-1">Search…</span>
        <kbd className="shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-medium text-slate-400">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 pt-24 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search accounts, projects, tasks, quotes, invoices, cases, resources…"
                className="flex-1 text-sm outline-none placeholder:text-slate-300"
              />
              {loading && <Loader2 size={14} className="shrink-0 animate-spin text-slate-300" />}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!results ? (
                <p className="px-4 py-8 text-center text-xs text-slate-400">
                  {query.length > 0 && query.length < 2 ? 'Keep typing…' : 'Search across the whole workspace.'}
                </p>
              ) : totalResults === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-400">No results for &ldquo;{query}&rdquo;</p>
              ) : (
                GROUPS.map((group) => {
                  const items = results[group.key] ?? [];
                  if (items.length === 0) return null;
                  const Icon = group.icon;
                  return (
                    <div key={group.key} className="border-b border-slate-50 py-1.5 last:border-0">
                      <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goTo(group, item)}
                          className={cn('flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50')}
                        >
                          <Icon size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate text-sm text-slate-700">{group.text(item)}</span>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
