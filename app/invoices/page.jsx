'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Receipt, Trash2, X, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, Send, Clock, Ban, FilePlus, Printer,
  Calendar, DollarSign, Building2, GitPullRequest, AlertTriangle,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useInvoices } from '@/hooks/useInvoices';
import { useUnbilledWork } from '@/hooks/useUnbilledWork';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { StatusBadge } from '@/components/ui/primitives';

// ── Status config ─────────────────────────────────────────────────────────
const STATUS = {
  draft:    { label: 'Draft',    tone: 'neutral' },
  sent:     { label: 'Sent',     tone: 'info'    },
  paid:     { label: 'Paid',     tone: 'success' },
  overdue:  { label: 'Overdue',  tone: 'danger'  },
  void:     { label: 'Void',     tone: 'neutral' },
};

function InvoiceStatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <StatusBadge tone={s.tone} dot>{s.label}</StatusBadge>;
}

// ── Formatters ────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n == null) return '$0.00';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayIso()    { return new Date().toISOString().split('T')[0]; }
function plusDays(d,n) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; }

// ── Line-item editor inside the modal ────────────────────────────────────
function LineItemsEditor({ items, onChange }) {
  const update = (i, field, val) => {
    const next = items.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [field]: val };
      if (field === 'qty' || field === 'unit_price') {
        updated.total = (Number(field === 'qty' ? val : updated.qty) || 0) *
                        (Number(field === 'unit_price' ? val : updated.unit_price) || 0);
      }
      return updated;
    });
    onChange(next);
  };
  const add = () => onChange([...items, { id: crypto.randomUUID(), description: '', qty: 1, unit_price: 0, total: 0 }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_60px_110px_110px_28px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1">
        <span>Description</span><span className="text-right">Qty</span>
        <span className="text-right">Unit Price</span><span className="text-right">Total</span><span />
      </div>
      {items.map((item, i) => (
        <div key={item.id ?? i} className="grid grid-cols-[1fr_60px_110px_110px_28px] gap-2 items-center">
          <input value={item.description} onChange={(e) => update(i, 'description', e.target.value)}
            placeholder="Description…"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400" />
          <input type="number" min="0" value={item.qty} onChange={(e) => update(i, 'qty', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
          <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => update(i, 'unit_price', e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
          <p className="text-right text-sm tabular-nums text-slate-700">{fmtMoney(item.total)}</p>
          <button type="button" onClick={() => remove(i)} className="flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:text-red-500">
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-1.5 text-xs text-slate-400 hover:border-blue-300 hover:text-blue-600">
        <Plus size={12} /> Add line item
      </button>
    </div>
  );
}

// ── Create / Edit invoice modal ───────────────────────────────────────────
function InvoiceModal({ initial = {}, onSave, onClose }) {
  const today = todayIso();
  const [form, setForm] = useState({
    title:         initial.title         ?? '',
    customer_name: initial.customer_name ?? '',
    invoice_date:  initial.invoice_date  ?? today,
    due_date:      initial.due_date      ?? plusDays(today, 30),
    line_items:    initial.line_items    ?? [],
    tax_rate:      initial.tax_rate      ?? 0,
    notes:         initial.notes         ?? '',
    project_id:    initial.project_id    ?? null,
    quote_id:      initial.quote_id      ?? null,
    crm_account_id:initial.crm_account_id?? null,
    change_order_id: initial.change_order_id ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);

  const subtotal   = form.line_items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const tax_amount = subtotal * (Number(form.tax_rate) || 0) / 100;
  const total      = subtotal + tax_amount;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, subtotal, tax_amount, total, tax_rate: Number(form.tax_rate) || 0 });
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit}
        className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FilePlus size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">{initial.id ? 'Edit Invoice' : 'New Invoice'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-5 p-6">
          {/* Top fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">Invoice Title *</label>
              <input autoFocus required value={form.title} onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Wi-Fi Installation – Harborview Hotel"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Customer / Bill To</label>
              <input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)}
                placeholder="Customer name"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Invoice Date</label>
              <input type="date" value={form.invoice_date} onChange={(e) => set('invoice_date', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Tax Rate (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.tax_rate}
                onChange={(e) => set('tax_rate', e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm tabular-nums outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">Line Items</p>
            <LineItemsEditor items={form.line_items} onChange={(items) => set('line_items', items)} />
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span><span className="tabular-nums">{fmtMoney(subtotal)}</span>
            </div>
            {Number(form.tax_rate) > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax ({form.tax_rate}%)</span><span className="tabular-nums">{fmtMoney(tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
              <span>Total</span><span className="tabular-nums">{fmtMoney(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes / Terms</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
              placeholder="Payment terms, thank you note…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-xs text-red-600">{error}</p>}
        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving || !form.title.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FilePlus size={13} />}
            {saving ? 'Saving…' : 'Save Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Invoice detail drawer ─────────────────────────────────────────────────
function InvoiceDetail({ invoice: inv, onClose, onUpdate, onDelete }) {
  const [saving, setSaving] = useState(false);
  if (!inv) return null;

  const setStatus = async (status) => {
    setSaving(true);
    try { await onUpdate(inv.id, { status }); } finally { setSaving(false); }
  };

  const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Invoice ${inv.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; color: #1e293b; }
        h1 { font-size: 28px; margin: 0; } .inv-num { color: #64748b; font-size: 14px; margin-top: 4px; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
        td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
        td:nth-child(2),td:nth-child(3),td:nth-child(4) { text-align: right; }
        .totals { margin-top: 16px; }
        .total-row { display: flex; justify-content: flex-end; gap: 40px; padding: 4px 0; font-size: 13px; }
        .grand-total { font-weight: 700; font-size: 16px; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
        .notes { margin-top: 32px; font-size: 12px; color: #64748b; }
      </style></head><body>
      <h1>${inv.title}</h1>
      <p class="inv-num">${inv.invoice_number}</p>
      <div class="row" style="margin-top:24px">
        <div><strong>Bill To:</strong><br>${inv.customer_name || '—'}</div>
        <div style="text-align:right">
          <div><strong>Invoice Date:</strong> ${fmtDate(inv.invoice_date)}</div>
          <div><strong>Due Date:</strong> ${fmtDate(inv.due_date)}</div>
          <div style="margin-top:8px;font-weight:700;font-size:15px;color:#2563eb">Status: ${(STATUS[inv.status] ?? STATUS.draft).label}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>${lineItems.map(i => `<tr><td>${i.description}</td><td>${i.qty}</td><td>${fmtMoney(i.unit_price)}</td><td>${fmtMoney(i.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal)}</span></div>
        ${inv.tax_rate > 0 ? `<div class="total-row"><span>Tax (${inv.tax_rate}%)</span><span>${fmtMoney(inv.tax_amount)}</span></div>` : ''}
        <div class="total-row grand-total"><span>Total</span><span>${fmtMoney(inv.total)}</span></div>
      </div>
      ${inv.notes ? `<div class="notes"><strong>Notes:</strong><br>${inv.notes}</div>` : ''}
      </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{inv.invoice_number}</p>
              <InvoiceStatusBadge status={inv.status} />
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">{inv.title}</h2>
            {inv.customer_name && <p className="text-xs text-slate-500">{inv.customer_name}</p>}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handlePrint} title="Print"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <Printer size={14} />
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-6 py-3">
          {inv.status !== 'sent' && inv.status !== 'paid' && (
            <button type="button" disabled={saving} onClick={() => setStatus('sent')}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50">
              <Send size={12} /> Mark Sent
            </button>
          )}
          {inv.status !== 'paid' && (
            <button type="button" disabled={saving} onClick={() => setStatus('paid')}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
              <CheckCircle2 size={12} /> Mark Paid
            </button>
          )}
          {inv.status !== 'overdue' && inv.status !== 'paid' && (
            <button type="button" disabled={saving} onClick={() => setStatus('overdue')}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Clock size={12} /> Mark Overdue
            </button>
          )}
          {inv.status !== 'void' && (
            <button type="button" disabled={saving} onClick={() => setStatus('void')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50">
              <Ban size={12} /> Void
            </button>
          )}
          {saving && <Loader2 size={14} className="animate-spin text-slate-400 self-center" />}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dates + links */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Invoice Date</p>
              <p className="mt-0.5 text-slate-700">{fmtDate(inv.invoice_date)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Due Date</p>
              <p className="mt-0.5 text-slate-700">{fmtDate(inv.due_date)}</p>
            </div>
            {inv.psa_projects?.name && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Project</p>
                <Link href={`/projects/${inv.project_id}`} className="mt-0.5 text-blue-600 hover:underline text-sm">
                  {inv.psa_projects.name}
                </Link>
              </div>
            )}
            {inv.saved_projects?.project_name && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Proposal / Quote</p>
                <Link href={`/builder?project=${inv.quote_id}`} className="mt-0.5 text-blue-600 hover:underline text-sm">
                  {inv.saved_projects.project_name}
                </Link>
              </div>
            )}
            {inv.crm_accounts?.name && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Account</p>
                <Link href={`/crm/${inv.crm_account_id}`} className="mt-0.5 text-blue-600 hover:underline text-sm">
                  {inv.crm_accounts.name}
                </Link>
              </div>
            )}
            {inv.change_orders?.title && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Change Order</p>
                {inv.project_id ? (
                  <Link href={`/projects/${inv.project_id}`} className="mt-0.5 flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    <GitPullRequest size={12} className="text-amber-500" /> {inv.change_orders.title}
                  </Link>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-700">
                    <GitPullRequest size={12} className="text-amber-500" /> {inv.change_orders.title}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Line Items</p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 text-left">Description</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Unit Price</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-300">No line items</td></tr>
                  ) : lineItems.map((item, i) => (
                    <tr key={item.id ?? i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 text-sm text-slate-700">{item.description}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">{item.qty}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-500">{fmtMoney(item.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-slate-800">{fmtMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span><span className="tabular-nums">{fmtMoney(inv.subtotal)}</span>
            </div>
            {inv.tax_rate > 0 && (
              <div className="flex justify-between text-sm text-slate-600">
                <span>Tax ({inv.tax_rate}%)</span><span className="tabular-nums">{fmtMoney(inv.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
              <span>Total</span><span className="tabular-nums">{fmtMoney(inv.total)}</span>
            </div>
          </div>

          {inv.notes && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Notes / Terms</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{inv.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-6 py-3">
          <button type="button"
            onClick={() => onDelete(inv.id, inv.invoice_number)}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue', 'void'];

function InvoicesContent() {
  const { session, company, user } = useSession();
  const { invoices, loading, loadError, hasMore, totalCount, loadMore, refresh, createInvoice, updateInvoice, deleteInvoice } =
    useInvoices(session, company, user);
  const { items: unbilled, unbilledProjects, totalValue: unbilledValue, refresh: refreshUnbilled } = useUnbilledWork(session, company);

  const [statusFilter,  setStatusFilter]  = useState('all');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [modalInitial,  setModalInitial]  = useState({});
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter((i) => i.status === statusFilter);

  const counts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === 'all' ? invoices.length : invoices.filter((i) => i.status === s).length;
    return acc;
  }, {});

  const handleDelete = (id, invoiceNumber) => {
    setConfirmState({
      title: 'Delete invoice',
      message: `Delete invoice ${invoiceNumber ?? id}? This cannot be undone.`,
      onConfirm: async () => {
        await deleteInvoice(id);
        setSelectedInvoice(null);
      },
    });
  };

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} total
            {invoices.filter(i => i.status === 'paid').length > 0 && (
              <> · <span className="text-emerald-600 font-medium">
                {fmtMoney(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0))} collected
              </span></>
            )}
          </p>
        </div>
        <button type="button" onClick={() => { setModalInitial({}); setModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus size={14} /> New Invoice
        </button>
      </div>

      {/* Unbilled work — approved COs and completed projects with no invoice */}
      {(unbilled.length > 0 || unbilledProjects.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              {[
                unbilled.length > 0 ? `${unbilled.length} approved change order${unbilled.length !== 1 ? 's' : ''}` : null,
                unbilledProjects.length > 0 ? `${unbilledProjects.length} completed project${unbilledProjects.length !== 1 ? 's' : ''}` : null,
              ].filter(Boolean).join(' + ')}{' '}not yet invoiced
            </p>
            <span className="ml-auto text-xs font-medium tabular-nums text-amber-700">{fmtMoney(unbilledValue)} unbilled</span>
          </div>
          <div className="space-y-1.5">
            {unbilledProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm">
                <Receipt size={13} className="shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{p.name}</p>
                  <p className="text-xs text-slate-400">Completed project · {p.customer_name ?? 'No customer'}</p>
                </div>
                {p.budget != null && <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">{fmtMoney(p.budget)}</span>}
                <button
                  type="button"
                  onClick={() => {
                    setModalInitial({
                      title: `Invoice – ${p.name}`,
                      customer_name: p.customer_name ?? '',
                      project_id: p.id,
                      quote_id: p.quote_id ?? null,
                      crm_account_id: p.crm_account_id ?? null,
                      line_items: p.budget ? [{ id: crypto.randomUUID(), description: p.name, qty: 1, unit_price: Number(p.budget), total: Number(p.budget) }] : [],
                    });
                    setModalOpen(true);
                  }}
                  className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  Create Invoice
                </button>
              </div>
            ))}
            {unbilled.map((co) => (
              <div key={co.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm">
                <GitPullRequest size={13} className="shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{co.title}</p>
                  <p className="text-xs text-slate-400">{co.psa_projects?.name ?? 'Project'}</p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">{fmtMoney(co.subtotal)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setModalInitial({
                      title: `Change Order — ${co.title}`,
                      project_id: co.project_id,
                      change_order_id: co.id,
                      line_items: (co.line_items ?? []).map((li) => ({ ...li, id: crypto.randomUUID() })),
                    });
                    setModalOpen(true);
                  }}
                  className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  Create Invoice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        {STATUS_TABS.map((s) => (
          <button key={s} type="button"
            onClick={() => setStatusFilter(s)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all',
              statusFilter === s
                ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}>
            {s === 'all' ? 'All' : (STATUS[s]?.label ?? s)}
            <span className="ml-1 text-xs opacity-70">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-16 text-slate-400">
          <Receipt size={32} className="text-slate-200" />
          <p className="text-sm font-medium">No {statusFilter !== 'all' ? `${STATUS[statusFilter]?.label.toLowerCase()} ` : ''}invoices yet</p>
          {statusFilter === 'all' && (
            <button type="button" onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              <Plus size={14} /> New Invoice
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Invoice #', 'Title', 'Customer', 'Project', 'Total', 'Due Date', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 last:border-0">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-slate-600">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{inv.title}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {inv.psa_projects?.name
                      ? <Link href={`/projects/${inv.project_id}`} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline">{inv.psa_projects.name}</Link>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums font-semibold text-slate-800">{fmtMoney(inv.total)}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? 'Loading…' : `Load more (${invoices.length} of ${totalCount})`}
          </button>
        </div>
      )}

      {modalOpen && (
        <InvoiceModal
          initial={modalInitial}
          onSave={async (data) => { await createInvoice(data); await refreshUnbilled(); }}
          onClose={() => { setModalOpen(false); setModalInitial({}); }}
        />
      )}
      {selectedInvoice && (
        <InvoiceDetail
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onUpdate={async (id, data) => {
            await updateInvoice(id, data);
            setSelectedInvoice((prev) => ({ ...prev, ...data }));
          }}
          onDelete={handleDelete}
        />
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

export default function InvoicesPage() {
  return <AuthGuard><OSShell><InvoicesContent /></OSShell></AuthGuard>;
}
