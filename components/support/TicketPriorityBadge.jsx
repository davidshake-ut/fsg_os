import { StatusBadge } from '@/components/ui/primitives';

// "high" priority keeps its own orange tone (distinct from "critical" red) —
// the semantic tone system covers the common 6, but a badge can still pass
// a raw tone name straight through when a domain genuinely needs a 7th.
export const PRIORITY_CONFIG = {
  low:      { label: 'Low',      tone: 'neutral' },
  medium:   { label: 'Medium',   tone: 'warning' },
  high:     { label: 'High',     tone: 'orange'  },
  critical: { label: 'Critical', tone: 'danger'  },
};

export const STATUS_CONFIG = {
  open:        { label: 'Open',        tone: 'info'     },
  in_progress: { label: 'In Progress', tone: 'progress' },
  waiting:     { label: 'Waiting',     tone: 'warning'  },
  resolved:    { label: 'Resolved',    tone: 'success'  },
  closed:      { label: 'Closed',      tone: 'neutral'  },
};

export default function TicketPriorityBadge({ priority, className }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return <StatusBadge tone={cfg.tone} className={className}>{cfg.label}</StatusBadge>;
}

export function TicketStatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return <StatusBadge tone={cfg.tone} className={className}>{cfg.label}</StatusBadge>;
}
