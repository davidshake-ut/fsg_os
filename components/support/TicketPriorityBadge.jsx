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

// What kind of problem this is — routes differently even at equal priority
// (a failed camera is a truck roll; a feature request is a backlog entry).
export const CATEGORY_CONFIG = {
  hardware:        { label: 'Hardware',          tone: 'orange'   },
  network:         { label: 'Network',           tone: 'info'     },
  software_bug:    { label: 'Bug',               tone: 'danger'   },
  configuration:   { label: 'Configuration',     tone: 'progress' },
  feature_request: { label: 'Feature Request',   tone: 'success'  },
  training:        { label: 'Training / How-To', tone: 'neutral'  },
  billing:         { label: 'Billing',           tone: 'warning'  },
  maintenance:     { label: 'Maintenance',       tone: 'neutral'  },
  other:           { label: 'Other',             tone: 'neutral'  },
};

// `labels` (optional): module-variant label overrides keyed by id — tones and
// ids stay semantic, only the words change.
export default function TicketPriorityBadge({ priority, className, labels }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return <StatusBadge tone={cfg.tone} className={className}>{labels?.[priority] ?? cfg.label}</StatusBadge>;
}

export function TicketStatusBadge({ status, className, labels }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return <StatusBadge tone={cfg.tone} className={className}>{labels?.[status] ?? cfg.label}</StatusBadge>;
}

export function TicketCategoryBadge({ category, className }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.other;
  return <StatusBadge tone={cfg.tone} className={className}>{cfg.label}</StatusBadge>;
}
