'use client';

import Link from 'next/link';
import {
  TrendingUp, Users, FolderKanban, DollarSign, AlertCircle,
  FileText, FileCheck, GitPullRequest, Receipt, LifeBuoy, Inbox,
  Send, ArrowRight, Workflow,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { Card } from '@/components/ui/primitives';
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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMoney(n) {
  if (!n) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function dueInfo(p) {
  if (!p.end_date) return { text: 'no due date', overdue: false };
  const label = new Date(p.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
          {t.assignee?.full_name ?? <span className="font-medium text-rose-400">Unassigned</span>}
          {t.due_date && (
            <span className={overdue ? 'font-semibold text-rose-500' : undefined}>
              {' '}· due {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

function DashboardContent() {
  const { session, company, user } = useSession();

  const { accounts,  loading: loadingCrm      } = useCRMAccounts(session, company, user);
  const { projects: psaProjects, loading: loadingPsa } = usePSAProjects(session, company, user);
  const { invoices,  loading: loadingInv      } = useInvoices(session, company, user);
  const { tickets,   loading: loadingTickets  } = useSupportTickets(session, company, user);
  const { projects: savedProjects, } = useProjects(session, company, user);
  const { resources, loading: loadingResources } = useResources(session, company, user);
  const { entries: activity, loading: loadingActivity } = useActivityLog(session, company);

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
    {
      label: 'Unassigned open tickets',
      sub: 'Nobody owns these yet',
      icon: LifeBuoy,
      count: tickets.filter((t) => (t.status === 'open' || t.status === 'in_progress') && !t.assigned_to).length,
      href: '/support',
    },
  ];

  const kpis = [
    {
      label: 'Total Customers',
      icon: Users,
      value: accounts.length,
      sub: 'CRM accounts',
      loading: loadingCrm,
      tone: 'info',
    },
    {
      label: 'Active Projects',
      icon: FolderKanban,
      value: activeProjects,
      sub: 'Planning + active',
      loading: loadingPsa,
      tone: 'progress',
    },
    {
      label: 'Revenue Collected',
      icon: DollarSign,
      value: fmtMoney(revenueCollected),
      sub: 'All paid invoices',
      loading: loadingInv,
      tone: 'success',
    },
    {
      label: 'Open Tickets',
      icon: AlertCircle,
      value: openTickets,
      sub: 'Open + in progress',
      loading: loadingTickets,
      tone: 'danger',
    },
    {
      label: 'Builder Proposals',
      icon: TrendingUp,
      value: savedProjects.length,
      sub: 'Saved quotes',
      loading: false,
      tone: 'warning',
    },
    {
      label: 'Documents',
      icon: FileText,
      value: resources.length,
      sub: `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`,
      loading: loadingResources,
      tone: 'orange',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time KPIs and business metrics across all FSG OS modules.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Active Projects — status, timeline, progress, and crew for the
              work in flight, one glance, no clicks */}
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

          {/* Pipeline — where the flow is stuck, each queue linking to the page
              with the push-to-next-stage action */}
          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Workflow size={15} className="text-slate-400" /> Pipeline
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
        </div>

        <div className="min-w-0 space-y-6">
          {/* Active Support Tickets — the support-desk pulse next to the
              delivery pulse */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <LifeBuoy size={15} className="text-slate-400" /> Active Tickets
                {activeTickets.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{activeTickets.length}</span>
                )}
              </h2>
              <Link href="/support" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loadingTickets ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-50" />
                ))}
              </div>
            ) : activeTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
                <LifeBuoy size={22} className="text-slate-200" />
                <p className="text-sm">No open tickets — inbox zero.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeTickets.map((t) => (
                  <ActiveTicketRow key={t.id} ticket={t} />
                ))}
              </div>
            )}
          </Card>

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
            <p className="text-sm">No activity yet — it'll show up here as quotes, projects, and tickets move.</p>
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
        </div>
      </div>
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
