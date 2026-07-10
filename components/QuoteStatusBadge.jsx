'use client';

import { StatusBadge } from '@/components/ui/primitives';

export const QUOTE_STATUS = {
  draft:    { label: 'Draft',    tone: 'neutral' },
  sent:     { label: 'Sent',     tone: 'info'    },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger'  },
  expired:  { label: 'Expired',  tone: 'warning' },
};

export default function QuoteStatusBadge({ status = 'draft', version, className }) {
  const cfg = QUOTE_STATUS[status] ?? QUOTE_STATUS.draft;
  return (
    <StatusBadge tone={cfg.tone} className={className}>
      {cfg.label}
      {version > 1 && <span className="opacity-70">v{version}</span>}
    </StatusBadge>
  );
}
