'use client';

import { useEffect, useState } from 'react';
import { Receipt, X, Plus, Loader2, FilePlus } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { Segmented } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

function todayIso() { return new Date().toISOString().split('T')[0]; }
function plusDays(d, n) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; }
const round2 = (n) => Math.round(n * 100) / 100;
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Create an invoice from a project. Two modes:
//   full       — one line item from the project budget (editable), the
//                original behavior from the projects list.
//   milestones — phase/progress billing: pick unbilled milestones, one line
//                each (default: budget split evenly across ALL milestones),
//                amounts editable. Selected ids persist to
//                invoices.milestone_ids so later invoices know what's billed.
// Milestone mode only appears when the caller passes the project's
// milestones (the project detail page); the list page stays full-only.
export default function CreateInvoiceModal({ project, milestones = [], onSave, onClose }) {
  const supabase = getSupabase();
  const today = todayIso();
  const canBillMilestones = milestones.length > 0;

  const [mode, setMode] = useState('full');
  const [billedIds, setBilledIds] = useState(new Set());
  const [selected, setSelected] = useState({}); // milestoneId -> amount
  const [form, setForm] = useState({
    title:         `Invoice – ${project.name}`,
    customer_name: project.customer_name ?? '',
    invoice_date:  today,
    due_date:      plusDays(today, 30),
    line_items:    project.budget ? [{ id: '1', description: project.name, qty: 1, unit_price: Number(project.budget), total: Number(project.budget) }] : [],
    tax_rate:      0,
    notes:         '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Which milestones have already been billed by earlier invoices.
  useEffect(() => {
    if (!supabase || !project?.id || !canBillMilestones) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('invoices').select('milestone_ids').eq('project_id', project.id);
      if (cancelled) return;
      const ids = new Set((data ?? []).flatMap((r) => r.milestone_ids ?? []));
      setBilledIds(ids);
    })();
    return () => { cancelled = true; };
  }, [supabase, project?.id, canBillMilestones]);

  const defaultShare = milestones.length > 0 && project.budget
    ? round2(Number(project.budget) / milestones.length)
    : 0;

  const toggleMilestone = (id) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = defaultShare;
      return next;
    });
  };

  const milestoneLines = milestones
    .filter((m) => m.id in selected)
    .map((m) => ({ id: m.id, description: m.name, qty: 1, unit_price: Number(selected[m.id]) || 0, total: Number(selected[m.id]) || 0 }));

  const activeLines = mode === 'milestones' ? milestoneLines : form.line_items;
  const subtotal   = activeLines.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const tax_amount = subtotal * (Number(form.tax_rate) || 0) / 100;
  const total      = subtotal + tax_amount;

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'milestones' && milestoneLines.length === 0) { setError('Select at least one milestone to bill.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        line_items: activeLines,
        subtotal, tax_amount, total,
        project_id: project.id,
        quote_id: project.quote_id ?? null,
        crm_account_id: project.crm_account_id ?? null,
        milestone_ids: mode === 'milestones' ? Object.keys(selected) : [],
      });
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-[var(--brand,#2563eb)]" />
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

          {canBillMilestones && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'full', label: 'Full project' },
                { value: 'milestones', label: 'Bill milestones' },
              ]}
            />
          )}

          {mode === 'milestones' ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-600">
                Milestones <span className="font-normal text-slate-400">— pick phases to bill; amounts default to an even split of the budget</span>
              </p>
              {milestones.map((m) => {
                const isBilled = billedIds.has(m.id);
                const isSelected = m.id in selected;
                return (
                  <div key={m.id} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5', isBilled ? 'opacity-50' : 'hover:bg-white')}>
                    <input
                      type="checkbox"
                      id={`ms-${m.id}`}
                      disabled={isBilled}
                      checked={isSelected}
                      onChange={() => toggleMilestone(m.id)}
                    />
                    <label htmlFor={`ms-${m.id}`} className={cn('min-w-0 flex-1 truncate text-sm', isBilled ? 'text-slate-400' : 'text-slate-700')}>
                      {m.name}
                      {isBilled && <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">billed</span>}
                    </label>
                    {isSelected && (
                      <input
                        type="number" min="0" step="0.01"
                        value={selected[m.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [m.id]: +e.target.value }))}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-blue-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">Line Items</p>
              {form.line_items.map((item, i) => (
                <div key={item.id ?? i} className="grid grid-cols-[1fr_90px_28px] gap-2 items-center">
                  <input value={item.description} onChange={(e) => {
                    const next = form.line_items.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it);
                    set('line_items', next);
                  }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400" />
                  <input type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={(e) => {
                      const next = form.line_items.map((it, idx) => idx === i ? { ...it, unit_price: +e.target.value, total: +e.target.value * (+it.qty || 1) } : it);
                      set('line_items', next);
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
                  <button type="button" onClick={() => set('line_items', form.line_items.filter((_, idx) => idx !== i))}
                    className="h-6 w-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500"><X size={12} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set('line_items', [...form.line_items, { id: String(Date.now()), description: '', qty: 1, unit_price: 0, total: 0 }])}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"><Plus size={11} /> Add line</button>
            </div>
          )}

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
            className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-medium disabled:opacity-60 [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] hover:brightness-110">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <FilePlus size={13} />}
            {saving ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
