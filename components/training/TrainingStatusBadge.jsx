import { StatusBadge } from '@/components/ui/primitives';

export const ASSIGNMENT_STATUS_CONFIG = {
  not_started: { label: 'Not Started', tone: 'neutral'  },
  in_progress: { label: 'In Progress', tone: 'progress' },
  completed:   { label: 'Completed',   tone: 'success'  },
  overdue:     { label: 'Overdue',     tone: 'danger'   },
};

export const CERT_STATUS_CONFIG = {
  active:        { label: 'Active',        tone: 'success' },
  expiring_soon: { label: 'Expiring Soon', tone: 'warning' },
  expired:       { label: 'Expired',       tone: 'danger'  },
  non_expiring:  { label: 'Non-Expiring',  tone: 'info'    },
};

export default function TrainingStatusBadge({ status, className }) {
  const cfg = ASSIGNMENT_STATUS_CONFIG[status] ?? ASSIGNMENT_STATUS_CONFIG.not_started;
  return <StatusBadge tone={cfg.tone} className={className}>{cfg.label}</StatusBadge>;
}

export function CertStatusBadge({ status, className }) {
  const cfg = CERT_STATUS_CONFIG[status] ?? CERT_STATUS_CONFIG.active;
  return <StatusBadge tone={cfg.tone} dot className={className}>{cfg.label}</StatusBadge>;
}
