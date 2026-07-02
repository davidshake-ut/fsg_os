'use client';

import { cn } from '@/lib/utils';

export const QUOTE_STATUS = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 border-slate-200'      },
  sent:     { label: 'Sent',     cls: 'bg-blue-50 text-blue-700 border-blue-200'          },
  accepted: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  declined: { label: 'Declined', cls: 'bg-red-50 text-red-700 border-red-200'             },
  expired:  { label: 'Expired',  cls: 'bg-amber-50 text-amber-700 border-amber-200'       },
};

export default function QuoteStatusBadge({ status = 'draft', version, className }) {
  const cfg = QUOTE_STATUS[status] ?? QUOTE_STATUS.draft;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', cfg.cls, className)}>
      {cfg.label}
      {version > 1 && <span className="opacity-70">v{version}</span>}
    </span>
  );
}
