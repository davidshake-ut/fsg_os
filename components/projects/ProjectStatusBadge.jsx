import { StatusBadge } from '@/components/ui/primitives';
import { toneClasses } from '@/lib/statusColors';

export const STATUS_CONFIG = {
  planning:  { label: 'Planning',  tone: 'warning'  },
  active:    { label: 'Active',    tone: 'info'     },
  on_hold:   { label: 'On Hold',   tone: 'neutral'  },
  complete:  { label: 'Complete',  tone: 'success'  },
  cancelled: { label: 'Cancelled', tone: 'danger'   },
};

export const TASK_STATUS_CONFIG = {
  todo:        { label: 'To Do',       tone: 'neutral'  },
  in_progress: { label: 'In Progress', tone: 'info'     },
  done:        { label: 'Done',        tone: 'success'  },
};

export default function ProjectStatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, tone: 'neutral' };
  return (
    <StatusBadge tone={cfg.tone} className={className}>
      {cfg.label}
    </StatusBadge>
  );
}

// className helper for call sites that render a status pill without the
// <StatusBadge> component (e.g. KanbanBoard's column headers).
export function taskStatusClasses(status) {
  return toneClasses(TASK_STATUS_CONFIG[status]?.tone ?? 'neutral', { border: false });
}
