'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Inbox, Trash2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useSupportTickets } from '@/hooks/useSupportTickets';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import NewTicketModal from '@/components/support/NewTicketModal';
import TicketPriorityBadge, { TicketStatusBadge, TicketCategoryBadge, STATUS_CONFIG } from '@/components/support/TicketPriorityBadge';
import { Card, Button } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

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
  const { session, company, user } = useSession();
  const { tickets, loading, loadError, hasMore, totalCount, loadMore, refresh, createTicket, deleteTicket } = useSupportTickets(session, company, user);
  const { accounts } = useCRMAccounts(session, company, user);
  const { projects } = usePSAProjects(session, company, user);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const filtered = statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter);

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = tickets.filter((t) => t.status === s).length;
    return acc;
  }, {});

  const statCounts = {
    open:     tickets.filter((t) => t.status === 'open').length,
    progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  };

  const handleDelete = (t) => {
    setConfirmState({
      title: 'Delete ticket',
      message: `Delete ticket "${t.title}"? This cannot be undone.`,
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
          <h1 className="text-xl font-semibold text-slate-900">Customer Support</h1>
          <p className="mt-1 text-sm text-slate-500">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} total</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={14} /> New Ticket</Button>
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

      {/* Status filter */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        <button onClick={() => setStatusFilter('all')}
          className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
            statusFilter === 'all' ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
          All <span className="ml-1 text-xs opacity-70">{tickets.length}</span>
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
        <p className="py-12 text-center text-sm text-slate-400">Loading tickets…</p>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{statusFilter === 'all' ? 'No tickets yet' : `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} tickets`}</p>
          {statusFilter === 'all' && <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}><Plus size={14} /> New Ticket</Button>}
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
                        {' '}· due {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

      <NewTicketModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={async (d) => { await createTicket(d); setToast({ type: 'success', message: 'Ticket created.' }); }} accounts={accounts} projects={projects} />
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
