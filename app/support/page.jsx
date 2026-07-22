'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Inbox, Trash2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useSupportTickets } from '@/hooks/useSupportTickets';
import { useModuleConfigs } from '@/hooks/useModuleConfigs';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import NewTicketModal from '@/components/support/NewTicketModal';
import TicketPriorityBadge, { TicketStatusBadge, TicketCategoryBadge, STATUS_CONFIG, PRIORITY_CONFIG, CATEGORY_CONFIG } from '@/components/support/TicketPriorityBadge';
import { Card, Button, Select } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';

const ALL_STATUSES = Object.keys(STATUS_CONFIG);

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SupportContent() {
  const { session, company, user, canWrite } = useSession();
  const { tickets, members, loading, loadError, hasMore, totalCount, loadMore, refresh, createTicket, deleteTicket } = useSupportTickets(session, company, user);
  const { accounts } = useCRMAccounts(session, company, user);
  const { projects } = usePSAProjects(session, company, user);
  const { configFor } = useModuleConfigs();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const q = search.trim().toLowerCase();
  // Everything except the status tab, so tab counts match what's listed.
  const preFiltered = tickets.filter((t) =>
    (!q || [t.title, t.description, t.crm_accounts?.name, t.assignee?.full_name, t.assignee?.email]
      .some((s) => s?.toLowerCase().includes(q)))
    && (priorityFilter === 'all' || t.priority === priorityFilter)
    && (categoryFilter === 'all' || t.category === categoryFilter));
  const filtered = statusFilter === 'all' ? preFiltered : preFiltered.filter((t) => t.status === statusFilter);
  const filtersActive = !!q || priorityFilter !== 'all' || categoryFilter !== 'all';

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = preFiltered.filter((t) => t.status === s).length;
    return acc;
  }, {});

  const statCounts = {
    open:     tickets.filter((t) => t.status === 'open').length,
    progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  };

  const handleDelete = (t) => {
    setConfirmState({
      title: 'Delete case',
      message: `Delete case "${t.title}"? This cannot be undone.`,
      onConfirm: async () => {
        setDeleting(t.id);
        try { await deleteTicket(t.id); } finally { setDeleting(null); }
      },
    });
  };

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{configFor('support').label}</h1>
          <p className="mt-1 text-sm text-slate-500">{tickets.length} case{tickets.length !== 1 ? 's' : ''} total</p>
        </div>
        {canWrite && <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={14} /> New Case</Button>}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Open',        value: statCounts.open,     color: 'text-blue-600' },
          { label: 'In Progress', value: statCounts.progress, color: 'text-violet-600' },
          { label: 'Resolved',    value: statCounts.resolved, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4 text-center">
            <p className={cn('text-2xl font-bold tabular-nums', color)}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </Card>
        ))}
      </div>

      {/* Search + priority/category filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases by subject, account, assignee…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-9 sm:w-40">
          <option value="all">All priorities</option>
          {Object.entries(PRIORITY_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 sm:w-44">
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </Select>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        <button onClick={() => setStatusFilter('all')}
          className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
            statusFilter === 'all' ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
          All <span className="ml-1 text-xs opacity-70">{preFiltered.length}</span>
        </button>
        {ALL_STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
              statusFilter === s ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
            {STATUS_CONFIG[s].label} <span className="ml-0.5 text-xs opacity-70">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading cases…</p>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {filtersActive ? 'No cases match your filters'
              : statusFilter === 'all' ? 'No cases yet' : `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} cases`}
          </p>
          {!filtersActive && statusFilter === 'all' && canWrite && <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}><Plus size={14} /> New Case</Button>}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Card key={t.id} className="group flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-md">
              <Link href={`/support/${t.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    {t.crm_accounts?.name ?? 'No account'} · {timeAgo(t.created_at)}
                    {' · '}
                    {t.assigned_to
                      ? (t.assignee?.full_name || t.assignee?.email || 'Assigned')
                      : <span className={t.status === 'open' || t.status === 'in_progress' ? 'font-medium text-rose-400' : undefined}>Unassigned</span>}
                    {t.due_date && (
                      <span className={t.due_date < new Date().toISOString().slice(0, 10) && t.status !== 'resolved' && t.status !== 'closed' ? ' font-semibold text-rose-500' : undefined}>
                        {' '}· due {fmtDate(t.due_date)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TicketCategoryBadge category={t.category} className="hidden sm:inline-flex" />
                  <TicketPriorityBadge priority={t.priority} />
                  <TicketStatusBadge status={t.status} />
                </div>
              </Link>
              <button onClick={() => handleDelete(t)} disabled={deleting === t.id}
                className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : `Load more (${tickets.length} of ${totalCount})`}
          </Button>
        </div>
      )}

      <NewTicketModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={async (d) => { await createTicket(d); setToast({ type: 'success', message: 'Case created.' }); }} accounts={accounts} projects={projects} members={members} />
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function SupportPage() {
  return <AuthGuard><OSShell><SupportContent /></OSShell></AuthGuard>;
}
