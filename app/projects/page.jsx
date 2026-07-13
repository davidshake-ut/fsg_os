'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Calendar,
  DollarSign,
  CheckCircle2,
  Circle,
  Trash2,
  FolderKanban,
  Receipt,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useProjects } from '@/hooks/useProjects';
import { useInvoices } from '@/hooks/useInvoices';
import ProjectStatusBadge, { STATUS_CONFIG, STATUS_STRIPE } from '@/components/projects/ProjectStatusBadge';
import ProjectProgressBar from '@/components/projects/ProjectProgressBar';
import AvatarStack from '@/components/projects/AvatarStack';
import { useProjectVitals } from '@/hooks/useProjectVitals';
import NewProjectModal from '@/components/projects/NewProjectModal';
import CreateInvoiceModal from '@/components/invoices/CreateInvoiceModal';
import { Card, Button } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';

const ALL_STATUSES = Object.keys(STATUS_CONFIG);

function fmt(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Schedule pulse for in-flight projects: overdue in red, closing-in in amber.
function dueChip(p) {
  if (!p.end_date || p.status === 'complete' || p.status === 'cancelled') return null;
  const days = Math.ceil((new Date(p.end_date + 'T00:00:00').getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, cls: 'bg-rose-50 text-rose-600 border-rose-200' };
  if (days === 0) return { text: 'due today', cls: 'bg-amber-50 text-amber-600 border-amber-200' };
  if (days <= 14) return { text: `due in ${days}d`, cls: 'bg-amber-50 text-amber-600 border-amber-200' };
  return null;
}

function ProjectsContent() {
  const { session, company, user } = useSession();
  const { projects, loading, loadError, refresh, createProject, deleteProject } = usePSAProjects(session, company, user);
  const { projects: quotes } = useProjects(session, company, user);
  const { createInvoice } = useInvoices(session, company, user);
  const vitals = useProjectVitals(session, company, projects);

  const [statusFilter,  setStatusFilter]  = useState('all');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [invoiceTarget, setInvoiceTarget] = useState(null);
  const [confirmState,  setConfirmState]  = useState(null);
  const [toast, setToast] = useState(null);

  const filtered = statusFilter === 'all'
    ? projects
    : projects.filter((p) => p.status === statusFilter);

  const handleDelete = (p) => {
    setConfirmState({
      title: 'Delete project',
      message: `Delete "${p.name}"? This will also remove all its tasks and time entries.`,
      onConfirm: async () => {
        setDeleting(p.id);
        try { await deleteProject(p.id); } finally { setDeleting(null); }
      },
    });
  };

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = projects.filter((p) => p.status === s).length;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            {projects.length} project{projects.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> New Project
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        <button
          onClick={() => setStatusFilter('all')}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
            statusFilter === 'all'
              ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
        >
          All <span className="ml-1 text-xs opacity-70">{projects.length}</span>
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
              statusFilter === s
                ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            {STATUS_CONFIG[s].label}{' '}
            <span className="ml-0.5 text-xs opacity-70">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {/* Project list */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading projects…</p>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <FolderKanban size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {statusFilter === 'all' ? 'No projects yet' : `No ${STATUS_CONFIG[statusFilter]?.label.toLowerCase()} projects`}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {statusFilter === 'all' && 'Create your first project to get started.'}
          </p>
          {statusFilter === 'all' && (
            <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus size={14} /> New Project
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((proj) => {
            const v = vitals[proj.id];
            const due = dueChip(proj);
            const who = proj.crm_accounts?.name ?? proj.customer_name;
            const where = proj.properties?.name;
            return (
            <Card
              key={proj.id}
              className="group relative flex items-center gap-4 overflow-hidden py-4 pl-6 pr-5 transition-shadow hover:shadow-md"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${STATUS_STRIPE[proj.status] ?? 'bg-slate-200'}`} />
              <Link href={`/projects/${proj.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{proj.name}</p>
                    {due && (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${due.cls}`}>{due.text}</span>
                    )}
                  </div>
                  {(who || where) && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {who}{who && where ? ' · ' : ''}{where}
                    </p>
                  )}
                </div>

                <div className="hidden w-44 shrink-0 lg:block">
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar size={12} className="shrink-0 text-slate-400" />
                    {proj.start_date ? fmtDate(proj.start_date) : '—'}
                    {proj.end_date && <> – {fmtDate(proj.end_date)}</>}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <DollarSign size={12} className="shrink-0 text-slate-400" />
                    {fmt(proj.budget)}
                  </p>
                </div>

                <div className="hidden w-36 shrink-0 sm:block">
                  {v && v.total > 0 ? (
                    <>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-slate-400">
                          {v.done}/{v.total} tasks
                          {v.overdue > 0 && <span className="font-semibold text-rose-500"> · {v.overdue} late</span>}
                        </span>
                        <span className="font-bold tabular-nums text-slate-600">{v.pct}%</span>
                      </div>
                      <ProjectProgressBar pct={v.pct} className="mt-1" />
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-300">No tasks yet</p>
                  )}
                </div>

                <AvatarStack members={v?.members ?? []} max={3} size={24} className="hidden shrink-0 md:flex" />

                <ProjectStatusBadge status={proj.status} className="shrink-0" />
              </Link>

              <button
                type="button"
                onClick={() => setInvoiceTarget(proj)}
                className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-500"
                title="Create invoice"
              >
                <Receipt size={15} />
              </button>
              <button
                onClick={() => handleDelete(proj)}
                disabled={deleting === proj.id}
                className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                title="Delete project"
              >
                <Trash2 size={15} />
              </button>
            </Card>
            );
          })}
        </div>
      )}

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={async (d) => { await createProject(d); setToast({ type: 'success', message: 'Project created.' }); }}
        quotes={quotes}
      />
      {invoiceTarget && (
        <CreateInvoiceModal
          project={invoiceTarget}
          onSave={async (data) => {
            await createInvoice(data);
            setInvoiceTarget(null);
            setToast({ type: 'success', message: 'Invoice created.' });
          }}
          onClose={() => setInvoiceTarget(null)}
        />
      )}
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

export default function ProjectsPage() {
  return (
    <AuthGuard>
      <OSShell>
        <ProjectsContent />
      </OSShell>
    </AuthGuard>
  );
}
