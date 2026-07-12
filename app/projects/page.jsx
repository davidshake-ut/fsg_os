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
import ProjectStatusBadge, { STATUS_CONFIG } from '@/components/projects/ProjectStatusBadge';
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

function ProjectsContent() {
  const { session, company, user } = useSession();
  const { projects, loading, loadError, refresh, createProject, deleteProject } = usePSAProjects(session, company, user);
  const { projects: quotes } = useProjects(session, company, user);
  const { createInvoice } = useInvoices(session, company, user);

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
          {filtered.map((proj) => (
            <Card
              key={proj.id}
              className="group flex items-center gap-4 px-5 py-4 transition-shadow hover:shadow-md"
            >
              <Link href={`/projects/${proj.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{proj.name}</p>
                  {proj.customer_name && (
                    <p className="truncate text-xs text-slate-500">{proj.customer_name}</p>
                  )}
                </div>

                <div className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
                  <Calendar size={12} />
                  {proj.start_date ? fmtDate(proj.start_date) : '—'}
                  {proj.end_date && <> – {fmtDate(proj.end_date)}</>}
                </div>

                <div className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
                  <DollarSign size={12} />
                  {fmt(proj.budget)}
                </div>

                <ProjectStatusBadge status={proj.status} />
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
          ))}
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
