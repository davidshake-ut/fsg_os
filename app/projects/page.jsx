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
  X,
  Loader2,
  FilePlus,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useProjects } from '@/hooks/useProjects';
import { useInvoices } from '@/hooks/useInvoices';
import ProjectStatusBadge, { STATUS_CONFIG } from '@/components/projects/ProjectStatusBadge';
import NewProjectModal from '@/components/projects/NewProjectModal';
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

function todayIso()    { return new Date().toISOString().split('T')[0]; }
function plusDays(d,n) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; }

function CreateInvoiceModal({ project, onSave, onClose }) {
  const today = todayIso();
  const [form, setForm] = useState({
    title:        `Invoice – ${project.name}`,
    customer_name: project.customer_name ?? '',
    invoice_date: today,
    due_date:     plusDays(today, 30),
    line_items:   project.budget ? [{ id: '1', description: project.name, qty: 1, unit_price: Number(project.budget), total: Number(project.budget) }] : [],
    tax_rate:     0,
    notes:        '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const subtotal   = form.line_items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const tax_amount = subtotal * (Number(form.tax_rate) || 0) / 100;
  const total      = subtotal + tax_amount;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, subtotal, tax_amount, total, project_id: project.id, quote_id: project.quote_id ?? null, crm_account_id: project.crm_account_id ?? null });
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Create Invoice</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>
        <div className="space-y-4 p-6 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Invoice Title *</label>
            <input autoFocus required value={form.title} onChange={(e) => set('title', e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Customer</label>
              <input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">Line Items</p>
            {form.line_items.map((item, i) => (
              <div key={item.id ?? i} className="grid grid-cols-[1fr_90px_28px] gap-2 items-center">
                <input value={item.description} onChange={(e) => {
                  const next = form.line_items.map((it,idx) => idx===i ? {...it,description:e.target.value} : it);
                  set('line_items', next);
                }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                <input type="number" min="0" step="0.01" value={item.unit_price}
                  onChange={(e) => {
                    const next = form.line_items.map((it,idx) => idx===i ? {...it,unit_price:+e.target.value,total:+e.target.value*(+it.qty||1)} : it);
                    set('line_items', next);
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
                <button type="button" onClick={() => set('line_items', form.line_items.filter((_,idx)=>idx!==i))}
                  className="h-6 w-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500"><X size={12} /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('line_items', [...form.line_items, {id:String(Date.now()),description:'',qty:1,unit_price:0,total:0}])}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"><Plus size={11} /> Add line</button>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2 flex justify-between">
            <span className="text-sm font-medium text-slate-700">Total</span>
            <span className="text-sm font-bold tabular-nums text-slate-900">{fmtMoney(total)}</span>
          </div>
        </div>
        {error && <p className="px-6 pb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FilePlus size={13} />}
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
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
              ? 'bg-blue-600 text-white shadow-sm'
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
                ? 'bg-blue-600 text-white shadow-sm'
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
