'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Users, FolderKanban, DollarSign, AlertCircle,
  FileText, FileCheck, GitPullRequest, Receipt, LifeBuoy, Inbox,
  Send, ArrowRight, Workflow, SlidersHorizontal, GripVertical, X, Plus,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { getSupabase } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui/primitives';
import ProjectStatusBadge, { STATUS_STRIPE } from '@/components/projects/ProjectStatusBadge';
import ProjectProgressBar from '@/components/projects/ProjectProgressBar';
import AvatarStack from '@/components/projects/AvatarStack';
import { useProjectVitals } from '@/hooks/useProjectVitals';
import { TicketStatusBadge, TicketCategoryBadge } from '@/components/support/TicketPriorityBadge';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useInvoices } from '@/hooks/useInvoices';
import { useSupportTickets } from '@/hooks/useSupportTickets';
import { useProjects } from '@/hooks/useProjects';
import { useResources } from '@/hooks/useResources';
import { useActivityLog } from '@/hooks/useActivityLog';
import { toneClasses, tileClasses } from '@/lib/statusColors';
import { KPI_CARDS, PANEL_CARDS, resolveDashboardConfig } from '@/lib/dashboardConfig';
import { cn } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';

const ACTIVITY_META = {
  quote:        { icon: FileCheck,      tone: 'info'     },
  change_order: { icon: GitPullRequest, tone: 'warning'  },
  invoice:      { icon: Receipt,        tone: 'success'  },
  project:      { icon: FolderKanban,   tone: 'progress' },
  ticket:       { icon: LifeBuoy,       tone: 'danger'   },
};

function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateShared(iso);
}

function fmtMoney(n) {
  if (!n) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function dueInfo(p) {
  if (!p.end_date) return { text: 'no due date', overdue: false };
  const label = fmtDateShared(p.end_date);
  const days = Math.floor((Date.now() - new Date(p.end_date + 'T00:00:00').getTime()) / 86400000);
  if (days > 0 && p.status !== 'complete' && p.status !== 'cancelled') {
    return { text: `due ${label} · ${days}d overdue`, overdue: true };
  }
  return { text: `due ${label}`, overdue: false };
}

// Ticket rows carry their priority as the stripe color — severity reads
// before you've read a word.
const PRIORITY_STRIPE = {
  critical: 'bg-rose-500',
  high:     'bg-orange-400',
  medium:   'bg-amber-300',
  low:      'bg-slate-300',
};
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function ActiveTicketRow({ ticket: t }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = t.due_date && t.due_date < today;
  return (
    <Link href={`/support/${t.id}`} className="group flex items-center gap-3 px-1.5 py-2.5 transition-colors hover:bg-slate-50">
      <span className={`h-8 w-1 shrink-0 rounded-full ${PRIORITY_STRIPE[t.priority] ?? 'bg-slate-200'}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-800 group-hover:text-blue-700">{t.title}</span>
        <span className="block truncate text-[11px] text-slate-400">
          {t.crm_accounts?.name && <>{t.crm_accounts.name} · </>}
          {fmtRelative(t.created_at)}
          {' · '}
          {t.assigned_to
            ? (t.assignee?.full_name || t.assignee?.email || 'Assigned')
            : <span className="font-medium text-rose-400">Unassigned</span>}
          {t.due_date && (
            <span className={overdue ? 'font-semibold text-rose-500' : undefined}>
              {' '}· due {fmtDateShared(t.due_date)}
            </span>
          )}
        </span>
      </span>
      <TicketCategoryBadge category={t.category} className="hidden shrink-0 xl:inline-flex" />
      <TicketStatusBadge status={t.status} className="shrink-0" />
    </Link>
  );
}

function ActiveProjectRow({ project: p, vitals }) {
  const due = dueInfo(p);
  const sub = p.crm_accounts?.name ?? p.customer_name;
  const v = vitals[p.id];
  return (
    <Link href={`/projects/${p.id}`} className="group flex items-center gap-3 px-1.5 py-2.5 transition-colors hover:bg-slate-50">
      <span className={`h-8 w-1 shrink-0 rounded-full ${STATUS_STRIPE[p.status] ?? 'bg-slate-200'}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-800 group-hover:text-blue-700">{p.name}</span>
        <span className="block truncate text-[11px] text-slate-400">
          {sub && <>{sub} · </>}
          <span className={due.overdue ? 'font-semibold text-rose-500' : undefined}>{due.text}</span>
        </span>
      </span>
      <ProjectStatusBadge status={p.status} className="hidden shrink-0 sm:inline-flex" />
      {v && v.total > 0 && (
        <span className="hidden shrink-0 items-center gap-1.5 md:flex">
          <ProjectProgressBar pct={v.pct} className="w-16" />
          <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-slate-500">{v.pct}%</span>
        </span>
      )}
      <AvatarStack members={v?.members ?? []} max={3} size={22} className="shrink-0" />
      <ArrowRight size={13} className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function KpiCard({ label, icon: Icon, value, sub, loading, tone = 'info' }) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${tileClasses(tone)}`}>
        <Icon size={20} />
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">
          {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-100" /> : value}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
      </div>
    </Card>
  );
}

// In customize mode every card gets a drag chip + remove button; outside it,
// the card renders untouched.
function SortableCard({ id, editing, label, onRemove, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  if (!editing) return children;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-30 opacity-90')}
    >
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-blue-400/50" />
      <div className="absolute -top-2.5 left-3 z-20 flex items-center gap-1">
        <button type="button" {...attributes} {...listeners}
          className="flex cursor-grab items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-600 shadow-sm active:cursor-grabbing">
          <GripVertical size={10} /> {label}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}
          className="rounded-full border border-rose-200 bg-white p-1 text-rose-500 shadow-sm hover:bg-rose-50">
          <X size={10} />
        </button>
      </div>
      {/* Freeze the card's own interactions while rearranging */}
      <div className="pointer-events-none select-none">{children}</div>
    </div>
  );
}

function DashboardContent() {
  const supabase = getSupabase();
  const { session, company, user, isAdmin, refresh: refreshSession } = useSession();

  const { accounts,  loading: loadingCrm      } = useCRMAccounts(session, company, user);
  const { projects: psaProjects, loading: loadingPsa } = usePSAProjects(session, company, user);
  const { invoices,  loading: loadingInv      } = useInvoices(session, company, user);
  const { tickets,   loading: loadingTickets  } = useSupportTickets(session, company, user);
  const { projects: savedProjects, } = useProjects(session, company, user);
  const { resources, loading: loadingResources } = useResources(session, company, user);
  const { entries: activity, loading: loadingActivity } = useActivityLog(session, company);

  // ── Per-team layout: saved config + admin customize mode ────────────────
  const config = resolveDashboardConfig(company?.dashboard_config);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = draft != null;
  const layout = draft ?? config;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const saveLayout = async () => {
    if (!supabase || !company?.id || !draft) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('companies').update({ dashboard_config: draft }).eq('id', company.id);
      if (!error) {
        await refreshSession?.().catch(() => {});
        setDraft(null);
      }
    } finally { setSaving(false); }
  };

  const removeCard = (kind, id) => setDraft((d) => ({ ...d, [kind]: d[kind].filter((x) => x !== id) }));
  const addCard = (kind, id) => setDraft((d) => ({ ...d, [kind]: [...d[kind], id] }));
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      if (!d) return d;
      for (const kind of ['kpis', 'panels']) {
        const from = d[kind].indexOf(active.id);
        const to = d[kind].indexOf(over.id);
        if (from !== -1 && to !== -1) return { ...d, [kind]: arrayMove(d[kind], from, to) };
      }
      return d;
    });
  };

  const activeProjects = psaProjects.filter(
    (p) => p.status === 'planning' || p.status === 'active',
  ).length;

  // The in-flight work, soonest deadline first — the dashboard's main stage.
  const spotlight = psaProjects
    .filter((p) => p.status === 'planning' || p.status === 'active' || p.status === 'on_hold')
    .sort((a, b) => ((a.end_date ?? '9999') < (b.end_date ?? '9999') ? -1 : 1))
    .slice(0, 6);
  const vitals = useProjectVitals(session, company, spotlight);

  // Support at a glance: hottest first, oldest first within a priority.
  const activeTickets = tickets
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .sort((a, b) =>
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
      || (a.created_at < b.created_at ? -1 : 1))
    .slice(0, 6);

  const revenueCollected = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total || 0), 0);

  const openTickets = tickets.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  ).length;

  const categoryCount = new Set(
    resources.filter((r) => r.category).map((r) => r.category),
  ).size;

  // ── Pipeline queues — the lifecycle's stuck points, each linking to the
  //    surface where the push-to-next-stage action lives. ──────────────────
  const projectsByQuote = new Set(psaProjects.filter((p) => p.quote_id).map((p) => p.quote_id));
  const projectsByProperty = new Set(psaProjects.filter((p) => p.property_id).map((p) => p.property_id));
  const invoicedProjectIds = new Set(invoices.filter((i) => i.project_id).map((i) => i.project_id));

  const queues = [
    {
      label: 'Proposals awaiting response',
      sub: 'Sent, no decision yet',
      icon: Send,
      count: savedProjects.filter((q) => q.status === 'sent').length,
      href: '/proposals',
    },
    {
      label: 'Accepted, no project yet',
      sub: 'Ready to kick off delivery',
      icon: FileCheck,
      count: savedProjects.filter(
        (q) => q.status === 'accepted' && !projectsByQuote.has(q.id) && !(q.property_id && projectsByProperty.has(q.property_id))
      ).length,
      href: '/proposals',
    },
    {
      label: 'Completed, not invoiced',
      sub: 'Finished work awaiting billing',
      icon: Receipt,
      count: psaProjects.filter((p) => p.status === 'complete' && !invoicedProjectIds.has(p.id)).length,
      href: '/invoices',
    },
  ];

  // Lives in the Active Tickets panel (not Pipeline) — it's a support-desk
  // signal, not a sales/delivery stage.
  const unassignedOpen = tickets.filter(
    (t) => (t.status === 'open' || t.status === 'in_progress') && !t.assigned_to,
  ).length;

  const kpiById = {
    customers: { label: 'Total Customers',   icon: Users,        value: accounts.length,          sub: 'CRM accounts',        loading: loadingCrm,       tone: 'info'     },
    projects:  { label: 'Active Projects',   icon: FolderKanban, value: activeProjects,           sub: 'Planning + active',   loading: loadingPsa,       tone: 'progress' },
    revenue:   { label: 'Revenue Collected', icon: DollarSign,   value: fmtMoney(revenueCollected), sub: 'All paid invoices', loading: loadingInv,       tone: 'success'  },
    tickets:   { label: 'Open Cases',      icon: AlertCircle,  value: openTickets,              sub: 'Open + in progress',  loading: loadingTickets,   tone: 'danger'   },
    proposals: { label: 'Builder Proposals', icon: TrendingUp,   value: savedProjects.length,     sub: 'Saved quotes',        loading: false,            tone: 'warning'  },
    documents: { label: 'Documents',         icon: FileText,     value: resources.length,         sub: `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`, loading: loadingResources, tone: 'orange' },
  };

  const renderPanel = (id) => {
    if (id === 'active_projects') return (
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FolderKanban size={15} className="text-slate-400" /> Active Projects
            {spotlight.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{spotlight.length}</span>
            )}
          </h2>
          <Link href="/projects" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {loadingPsa ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-50" />
            ))}
          </div>
        ) : spotlight.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
            <FolderKanban size={22} className="text-slate-200" />
            <p className="text-sm">Nothing in flight — accepted proposals become projects here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {spotlight.map((p) => (
              <ActiveProjectRow key={p.id} project={p} vitals={vitals} />
            ))}
          </div>
        )}
      </Card>
    );
    if (id === 'pipeline') return (
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Workflow size={15} className="text-slate-400" /> Pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {queues.map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="group flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <q.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className={`text-xl font-bold ${q.count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{q.count}</span>
                  <ArrowRight size={12} className="text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="block text-xs font-medium text-slate-600">{q.label}</span>
                <span className="block text-[11px] text-slate-400">{q.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    );
    if (id === 'active_tickets') return (
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <LifeBuoy size={15} className="text-slate-400" /> Active Cases
            {activeTickets.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{activeTickets.length}</span>
            )}
          </h2>
          <Link href="/support" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {unassignedOpen > 0 && (
          <Link href="/support"
            className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100">
            <AlertCircle size={13} className="shrink-0" />
            {unassignedOpen} open case{unassignedOpen !== 1 ? 's' : ''} unassigned — nobody owns {unassignedOpen !== 1 ? 'these' : 'it'} yet
            <ArrowRight size={12} className="ml-auto shrink-0" />
          </Link>
        )}
        {loadingTickets ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-50" />
            ))}
          </div>
        ) : activeTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
            <LifeBuoy size={22} className="text-slate-200" />
            <p className="text-sm">No open cases — inbox zero.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeTickets.map((t) => (
              <ActiveTicketRow key={t.id} ticket={t} />
            ))}
          </div>
        )}
      </Card>
    );
    if (id === 'activity') return (
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Recent Activity</h2>
        {loadingActivity ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-50" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
            <Inbox size={22} className="text-slate-200" />
            <p className="text-sm">No activity yet — it&apos;ll show up here as quotes, projects, and cases move.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activity.map((a) => {
              const { icon: Icon, tone } = ACTIVITY_META[a.entity_type] ?? ACTIVITY_META.project;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-slate-50">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneClasses(tone, { border: false })}`}>
                    <Icon size={14} />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {a.label}
                    {a.users?.full_name && (
                      <span className="text-slate-400"> · {a.users.full_name}</span>
                    )}
                  </p>
                  <span className="shrink-0 text-xs text-slate-400">{fmtRelative(a.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
    return null;
  };

  const visibleKpis = layout.kpis.filter((id) => kpiById[id]);
  const leftPanels  = layout.panels.filter((id) => PANEL_CARDS[id]?.column === 'left');
  const rightPanels = layout.panels.filter((id) => PANEL_CARDS[id]?.column === 'right');
  const hiddenKpis   = Object.keys(KPI_CARDS).filter((id) => !layout.kpis.includes(id));
  const hiddenPanels = Object.keys(PANEL_CARDS).filter((id) => !layout.panels.includes(id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {editing
              ? 'Drag cards to rearrange, ✕ to remove, add hidden cards below — then save for your whole team.'
              : 'Real-time KPIs and business metrics across all FSG OS modules.'}
          </p>
        </div>
        {isAdmin && (
          editing ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" onClick={saveLayout} disabled={saving}>
                {saving ? 'Saving…' : 'Save Layout'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setDraft(config)}>
              <SlidersHorizontal size={13} /> Customize
            </Button>
          )
        )}
      </div>

      {editing && (hiddenKpis.length > 0 || hiddenPanels.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-3 py-2.5">
          <span className="text-xs font-semibold text-blue-700">Add cards:</span>
          {hiddenKpis.map((id) => (
            <button key={id} type="button" onClick={() => addCard('kpis', id)}
              className="flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-600 shadow-sm hover:bg-blue-50">
              <Plus size={11} /> {KPI_CARDS[id].label}
            </button>
          ))}
          {hiddenPanels.map((id) => (
            <button key={id} type="button" onClick={() => addCard('panels', id)}
              className="flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 shadow-sm hover:bg-indigo-50">
              <Plus size={11} /> {PANEL_CARDS[id].label} panel
            </button>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {visibleKpis.length > 0 && (
          <SortableContext items={visibleKpis} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleKpis.map((id) => (
                <SortableCard key={id} id={id} editing={editing} label={KPI_CARDS[id].label}
                  onRemove={() => removeCard('kpis', id)}>
                  <KpiCard {...kpiById[id]} />
                </SortableCard>
              ))}
            </div>
          </SortableContext>
        )}

        {(leftPanels.length > 0 || rightPanels.length > 0) && (
          <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
            <div className="min-w-0 space-y-6">
              <SortableContext items={leftPanels} strategy={verticalListSortingStrategy}>
                {leftPanels.map((id) => (
                  <SortableCard key={id} id={id} editing={editing} label={PANEL_CARDS[id].label}
                    onRemove={() => removeCard('panels', id)}>
                    {renderPanel(id)}
                  </SortableCard>
                ))}
              </SortableContext>
            </div>
            <div className="min-w-0 space-y-6">
              <SortableContext items={rightPanels} strategy={verticalListSortingStrategy}>
                {rightPanels.map((id) => (
                  <SortableCard key={id} id={id} editing={editing} label={PANEL_CARDS[id].label}
                    onRemove={() => removeCard('panels', id)}>
                    {renderPanel(id)}
                  </SortableCard>
                ))}
              </SortableContext>
            </div>
          </div>
        )}
      </DndContext>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <OSShell>
        <DashboardContent />
      </OSShell>
    </AuthGuard>
  );
}
