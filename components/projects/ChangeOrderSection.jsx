'use client';

import { useState } from 'react';
import { Plus, X, Trash2, ChevronDown, ChevronRight, Send, CheckCircle2, Ban, FileDiff, CalendarClock } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useChangeOrders } from '@/hooks/useChangeOrders';
import { computeCoTotals } from '@/lib/changeOrders';
import { fmtDate as fmtDateShared } from '@/lib/format';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { Button, Field, TextInput, StatusBadge } from '@/components/ui/primitives';

const CO_STATUS = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info'    },
  approved:  { label: 'Approved',  tone: 'success' },
  rejected:  { label: 'Rejected',  tone: 'danger'  },
};

const fmtMoney = (n) =>
  `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CoStatusBadge({ status }) {
  const cfg = CO_STATUS[status] ?? CO_STATUS.draft;
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
}

const EMPTY_ITEM = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, description: '', qty: 1, unit_price: 0 });

function NewChangeOrderModal({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', schedule_impact_days: 0 });
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (id, patch) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const { subtotal } = computeCoTotals(items);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim(),
        schedule_impact_days: Number(form.schedule_impact_days) || 0,
        line_items: items.filter((i) => i.description.trim() || Number(i.unit_price) > 0),
      });
      onClose();
    } catch (ex) { setErr(ex.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="New Change Order">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Change Order</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
            <Field label="Title">
              <TextInput autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Add 6 cameras to parking garage" />
            </Field>
            <Field label="Schedule impact (days)">
              <TextInput type="number" min="0" value={form.schedule_impact_days} onChange={(e) => set('schedule_impact_days', e.target.value)} />
            </Field>
          </div>
          <Field label="Description / justification">
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3}
              placeholder="What changed, why, and who requested it…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
          </Field>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">Line Items</p>
            {items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_70px_110px_28px] items-center gap-2">
                <input value={item.description} onChange={(e) => setItem(item.id, { description: e.target.value })}
                  placeholder="Description"
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                <input type="number" min="0" step="1" value={item.qty} aria-label="Quantity"
                  onChange={(e) => setItem(item.id, { qty: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                <input type="number" min="0" step="0.01" value={item.unit_price} aria-label="Unit price"
                  onChange={(e) => setItem(item.id, { unit_price: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                <button type="button" aria-label="Remove line item"
                  onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setItems((list) => [...list, EMPTY_ITEM()])}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus size={13} /> Add line
              </button>
              <p className="text-sm font-semibold text-slate-800">Subtotal: <span className="tabular-nums">{fmtMoney(subtotal)}</span></p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Change Order'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangeOrderRow({ co, onStatus, onDelete }) {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(co.line_items) ? co.line_items : [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown size={15} className="shrink-0 text-slate-400" /> : <ChevronRight size={15} className="shrink-0 text-slate-400" />}
        <span className="shrink-0 font-mono text-xs font-semibold text-slate-400">CO-{String(co.co_number).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{co.title}</span>
        {co.schedule_impact_days > 0 && (
          <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
            <CalendarClock size={12} /> +{co.schedule_impact_days}d
          </span>
        )}
        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">{fmtMoney(co.subtotal)}</span>
        <CoStatusBadge status={co.status} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {co.description && <p className="whitespace-pre-wrap text-sm text-slate-600">{co.description}</p>}
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="py-1.5 pr-2 font-medium">Description</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Unit</th>
                    <th className="py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => (
                    <tr key={i.id ?? idx} className="border-b border-slate-50 last:border-0">
                      <td className="py-1.5 pr-2 text-slate-700">{i.description}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{i.qty}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{fmtMoney(i.unit_price)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-slate-800">{fmtMoney(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {co.status === 'draft' && (
              <>
                <Button size="sm" onClick={() => onStatus(co, 'submitted')}><Send size={13} /> Submit</Button>
                <Button size="sm" variant="outline" onClick={() => onDelete(co)}><Trash2 size={13} /> Delete</Button>
              </>
            )}
            {co.status === 'submitted' && (
              <>
                <Button size="sm" onClick={() => onStatus(co, 'approved')}><CheckCircle2 size={13} /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => onStatus(co, 'rejected')}><Ban size={13} /> Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => onStatus(co, 'draft')}>Back to Draft</Button>
              </>
            )}
            {co.status === 'rejected' && (
              <Button size="sm" variant="outline" onClick={() => onStatus(co, 'draft')}>Reopen as Draft</Button>
            )}
            {co.status === 'approved' && co.approved_at && (
              <p className="text-xs text-slate-400">Approved {fmtDateShared(co.approved_at)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChangeOrderSection({ project }) {
  const { session, company, user } = useSession();
  const {
    changeOrders, loading, loadError, approvedTotal, refresh,
    createChangeOrder, setChangeOrderStatus, deleteChangeOrder,
  } = useChangeOrders(session, company, user, project?.id);

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const handleStatus = (co, status) => {
    const run = async () => {
      try {
        await setChangeOrderStatus(co.id, status);
        setToast({ type: 'success', message: `CO-${String(co.co_number).padStart(2, '0')} ${status === 'draft' ? 'reopened' : status}.` });
      } catch (e) { setToast({ type: 'error', message: e.message }); }
    };
    if (status === 'approved') {
      setConfirmState({
        title: 'Approve change order',
        message: `Approve "${co.title}" for ${fmtMoney(co.subtotal)}? Approved change orders count toward the project's revised value.`,
        confirmLabel: 'Approve',
        variant: 'default',
        onConfirm: run,
      });
    } else {
      void run();
    }
  };

  const handleDelete = (co) => {
    setConfirmState({
      title: 'Delete change order',
      message: `Delete "${co.title}"? This cannot be undone.`,
      onConfirm: async () => {
        try { await deleteChangeOrder(co.id); }
        catch (e) { setToast({ type: 'error', message: e.message }); }
      },
    });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <ErrorBanner error={loadError} onRetry={refresh} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Change Orders</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Scope changes after the quote was accepted. Approved total:{' '}
            <span className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(approvedTotal)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}><Plus size={14} /> New Change Order</Button>
      </div>

      {changeOrders.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center">
          <FileDiff size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No change orders yet</p>
          <p className="mt-1 text-xs text-slate-400">Track scope additions so they get billed, not absorbed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {changeOrders.map((co) => (
            <ChangeOrderRow key={co.id} co={co} onStatus={handleStatus} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewChangeOrderModal
          onSave={async (data) => {
            await createChangeOrder({ ...data, quote_id: project?.quote_id ?? null });
            setToast({ type: 'success', message: 'Change order created.' });
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
