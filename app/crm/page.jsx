'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Building2, Phone, Globe, Trash2, List, KanbanSquare, UserCheck } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import NewAccountModal from '@/components/crm/NewAccountModal';
import PipelineBoard from '@/components/crm/PipelineBoard';
import { Card, Button } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';
import { toneClasses } from '@/lib/statusColors';

const TYPE_LABELS = {
  hospitality: 'Hospitality', senior_living: 'Senior Living',
  multi_family: 'Multi-Family', education: 'Education',
  healthcare: 'Healthcare', other: 'Other',
};

const ACCOUNT_STATUS_TONE = {
  active:   'success',
  prospect: 'warning',
  inactive: 'neutral',
};

function CRMContent() {
  const { session, company, user, canWrite } = useSession();
  const { accounts, loading, loadError, hasMore, totalCount, loadMore, refresh, createAccount, updateAccount, deleteAccount } = useCRMAccounts(session, company, user);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const searchFiltered = accounts.filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()));
  const filtered = searchFiltered.filter((a) => statusFilter === 'all' || a.status === statusFilter);

  const handleDelete = (a) => {
    setConfirmState({
      title: 'Delete account',
      message: `Delete "${a.name}"? This will also remove all contacts.`,
      onConfirm: async () => {
        setDeleting(a.id);
        try { await deleteAccount(a.id); } finally { setDeleting(null); }
      },
    });
  };

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">CRM</h1>
          <p className="mt-1 text-sm text-slate-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> New Account
          </Button>
        )}
      </div>

      {/* Search + status filter + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        {view === 'list' && (
          <div className="flex gap-1 rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
            {/* Flow language: a Lead is an account still being sold
                (status=prospect); winning the pipeline (or the convert
                action) makes it a Customer (status=active). */}
            {[['all', 'All'], ['prospect', 'Leads'], ['active', 'Customers'], ['inactive', 'Inactive']].map(([s, label]) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-all',
                  statusFilter === s ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                )}
              >{label} <span className="ml-0.5 opacity-70">{s === 'all' ? accounts.length : accounts.filter((a) => a.status === s).length}</span></button>
            ))}
          </div>
        )}
        <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {[['list', List, 'List'], ['pipeline', KanbanSquare, 'Pipeline']].map(([id, Icon, label]) => (
            <button key={id} type="button" title={label} onClick={() => setView(id)}
              className={cn('flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'pipeline' ? (
        <PipelineBoard accounts={searchFiltered} onUpdateAccount={updateAccount} />
      ) : loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading accounts…</p>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Building2 size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{search ? 'No accounts match your search' : 'No accounts yet'}</p>
          {!search && canWrite && <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}><Plus size={14} /> New Account</Button>}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.id} className="group flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-md">
              <Link href={`/crm/${a.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <Building2 size={18} className="text-slate-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-400">{TYPE_LABELS[a.type] ?? a.type}</p>
                </div>
                <div className="hidden items-center gap-3 sm:flex">
                  {a.phone && <span className="flex items-center gap-1 text-xs text-slate-400"><Phone size={11} />{a.phone}</span>}
                  {a.website && <span className="flex items-center gap-1 text-xs text-slate-400"><Globe size={11} />{a.website.replace(/^https?:\/\//, '')}</span>}
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', toneClasses(ACCOUNT_STATUS_TONE[a.status] ?? 'warning'))}>
                  {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                </span>
              </Link>
              {a.status === 'prospect' && (
                <button
                  onClick={async () => {
                    await updateAccount(a.id, { status: 'active' });
                    setToast({
                      type: 'success',
                      message: (
                        <>
                          {a.name} is now a customer.{' '}
                          <Link href={`/builder?account=${a.id}`} className="font-semibold underline">Create a proposal →</Link>
                        </>
                      ),
                    });
                  }}
                  title="Convert to customer"
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-emerald-50 hover:text-emerald-600">
                  <UserCheck size={15} />
                </button>
              )}
              <button onClick={() => handleDelete(a)} disabled={deleting === a.id}
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
            {loading ? 'Loading…' : `Load more (${accounts.length} of ${totalCount})`}
          </Button>
        </div>
      )}

      <NewAccountModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={async (d) => { await createAccount(d); setToast({ type: 'success', message: 'Account created.' }); }} />
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

export default function CRMPage() {
  return <AuthGuard><OSShell><CRMContent /></OSShell></AuthGuard>;
}
