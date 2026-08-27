'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, CheckCircle2, Ban, Undo2, GitBranch, ChevronDown, Copy } from 'lucide-react';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { cn } from '@/lib/utils';

// Status badge + dropdown of the transitions valid from the current status.
// Shared by the Builder header and the Proposals page. onRevision is
// optional — surfaces that can't build a revision payload (the Proposals
// list) simply don't offer it; revisions are made in the Builder, where the
// full quote state lives.
export default function QuoteLifecycleMenu({ quote, onTransition, onRevision = null, onCloneOption = null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const status = quote.status ?? 'draft';
  const nextVersion = (quote.version ?? 1) + 1;
  const items = [];
  if (status === 'draft') {
    items.push({ label: 'Mark as Sent', Icon: Send, run: () => onTransition('sent') });
  }
  if (status === 'sent') {
    items.push({ label: 'Mark Accepted', Icon: CheckCircle2, run: () => onTransition('accepted') });
    items.push({ label: 'Mark Declined', Icon: Ban, run: () => onTransition('declined') });
    items.push({ label: 'Reopen as Draft', Icon: Undo2, run: () => onTransition('draft') });
  }
  if (status === 'declined' || status === 'expired') {
    items.push({ label: 'Reopen as Draft', Icon: Undo2, run: () => onTransition('draft') });
  }
  if (status !== 'draft' && onRevision) {
    items.push({ label: `New Revision (v${nextVersion})`, Icon: GitBranch, run: onRevision });
  }
  // Design options (0068): fork this quote into a sibling on the same
  // property to price the design another way. Builder only — it holds the
  // full quote state.
  if (onCloneOption) {
    items.push({ label: 'Clone as design option…', Icon: Copy, run: onCloneOption });
  }

  if (items.length === 0) return <QuoteStatusBadge status={status} version={quote.version} />;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quote status actions"
        className="flex items-center gap-0.5 rounded-full hover:opacity-80"
      >
        <QuoteStatusBadge status={status} version={quote.version} />
        <ChevronDown size={12} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          {items.map(({ label, Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setOpen(false); run(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Icon size={14} className="shrink-0 text-slate-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
