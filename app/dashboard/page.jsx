'use client';

import {
  TrendingUp, Users, FolderKanban, DollarSign, Clock, AlertCircle,
  FileText, Layers, FileCheck, GitPullRequest, Receipt, LifeBuoy, Inbox,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { Card } from '@/components/ui/primitives';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useInvoices } from '@/hooks/useInvoices';
import { useSupportTickets } from '@/hooks/useSupportTickets';
import { useProjects } from '@/hooks/useProjects';
import { useResources } from '@/hooks/useResources';
import { useActivityLog } from '@/hooks/useActivityLog';

const ACTIVITY_META = {
  quote:        { icon: FileCheck,      cls: 'bg-blue-50 text-blue-600' },
  change_order: { icon: GitPullRequest, cls: 'bg-amber-50 text-amber-600' },
  invoice:      { icon: Receipt,        cls: 'bg-emerald-50 text-emerald-600' },
  project:      { icon: FolderKanban,   cls: 'bg-violet-50 text-violet-600' },
  ticket:       { icon: LifeBuoy,       cls: 'bg-red-50 text-red-600' },
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

function KpiCard({ label, icon: Icon, value, sub, loading }) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
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

  const revenueCollected = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total || 0), 0);

  const openTickets = tickets.filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  ).length;

  const categoryCount = new Set(
    resources.filter((r) => r.category).map((r) => r.category),
  ).size;

  const kpis = [
    {
      label: 'Total Customers',
      icon: Users,
      value: accounts.length,
      sub: 'CRM accounts',
      loading: loadingCrm,
    },
    {
      label: 'Active Projects',
      icon: FolderKanban,
      value: activeProjects,
      sub: 'Planning + active',
      loading: loadingPsa,
    },
    {
      label: 'Revenue Collected',
      icon: DollarSign,
      value: fmtMoney(revenueCollected),
      sub: 'All paid invoices',
      loading: loadingInv,
    },
    {
      label: 'Open Tickets',
      icon: AlertCircle,
      value: openTickets,
      sub: 'Open + in progress',
      loading: loadingTickets,
    },
    {
      label: 'Builder Proposals',
      icon: TrendingUp,
      value: savedProjects.length,
      sub: 'Saved quotes',
      loading: false,
    },
    {
      label: 'Avg. Response Time',
      icon: Clock,
      value: '—',
      sub: 'Coming soon',
      loading: false,
    },
    {
      label: 'Documents',
      icon: FileText,
      value: resources.length,
      sub: 'Resources uploaded',
      loading: loadingResources,
    },
    {
      label: 'Resource Groups',
      icon: Layers,
      value: categoryCount,
      sub: 'Unique categories',
      loading: loadingResources,
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
              const { icon: Icon, cls } = ACTIVITY_META[a.entity_type] ?? ACTIVITY_META.project;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-slate-50">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cls}`}>
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
