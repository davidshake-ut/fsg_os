'use client';

import { useState } from 'react';
import { Clock, Trash2, Plus } from 'lucide-react';
import { Button, Field, Select, TextInput, Toggle } from '@/components/ui/primitives';
import { Card } from '@/components/ui/primitives';
import { currency } from '@/lib/format';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(n) {
  return n ? currency(n) : null;
}

function groupByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = e.logged_date || e.created_at?.slice(0, 10) || today();
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(e);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TimeLog({ tasks, timeEntries, onLog, onDelete }) {
  const [form, setForm] = useState({
    task_id: '',
    logged_date: today(),
    hours: '',
    notes: '',
    billable: true,
    cost_rate: '',
    bill_rate: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const totalHours = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);
  const totalCost = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0) * (parseFloat(e.cost_rate) || 0), 0);

  const handleLog = async (e) => {
    e.preventDefault();
    const hours = parseFloat(form.hours);
    if (!hours || hours <= 0) { setErr('Enter a valid number of hours.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await onLog({
        task_id: form.task_id || null,
        logged_date: form.logged_date || today(),
        hours,
        notes: form.notes.trim() || null,
        billable: form.billable,
        cost_rate: form.cost_rate === '' ? null : parseFloat(form.cost_rate),
        bill_rate: form.bill_rate === '' ? null : parseFloat(form.bill_rate),
      });
      // Rates/billable carry over to the next entry — logging several hours
      // in a row for the same person shouldn't mean re-typing their rate
      // every time. Hours/notes reset since those are per-entry.
      setForm((f) => ({ ...f, logged_date: today(), hours: '', notes: '' }));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const groups = groupByDate(timeEntries);

  return (
    <div className="space-y-5">
      {/* Log form */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Plus size={15} /> Log Time
        </h3>
        {err && (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {err}
          </p>
        )}
        <form onSubmit={handleLog} className="grid gap-3 sm:grid-cols-4">
          <Field label="Task (optional)" className="sm:col-span-2">
            <Select value={form.task_id} onChange={(e) => set('task_id', e.target.value)}>
              <option value="">— general time —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={form.logged_date}
              onChange={(e) => set('logged_date', e.target.value)}
            />
          </Field>
          <Field label="Hours">
            <TextInput
              type="number"
              min="0.25"
              step="0.25"
              value={form.hours}
              onChange={(e) => set('hours', e.target.value)}
              placeholder="1.5"
              required
            />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <TextInput
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="What did you work on?"
            />
          </Field>
          <Field label="Cost Rate ($/hr)" sub="What we pay">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.cost_rate}
              onChange={(e) => set('cost_rate', e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Bill Rate ($/hr)" sub="What we charge">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.bill_rate}
              onChange={(e) => set('bill_rate', e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Billable">
            <div className="flex h-9 items-center">
              <Toggle checked={form.billable} onChange={(v) => set('billable', v)} />
            </div>
          </Field>
          <Field label=" ">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Saving…' : 'Log Time'}
            </Button>
          </Field>
        </form>
      </Card>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Clock size={15} className="text-slate-400" />
        <span className="font-medium text-slate-700">
          {totalHours.toFixed(1)}h total logged
        </span>
        <span className="text-slate-400">across {timeEntries.length} entr{timeEntries.length === 1 ? 'y' : 'ies'}</span>
        {totalCost > 0 && <span className="text-slate-400">· {currency(totalCost)} cost</span>}
      </div>

      {/* Entries grouped by date */}
      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No time logged yet — use the form above to start tracking.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, entries]) => (
            <div key={date}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {formatDate(date)}
              </p>
              <Card className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const task = tasks.find((t) => t.id === entry.task_id);
                  const who = entry.users?.full_name || entry.users?.email || 'You';
                  const cost = entry.cost_rate ? entry.hours * entry.cost_rate : null;
                  return (
                    <div key={entry.id} className="group flex items-start gap-3 px-4 py-3">
                      <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {entry.hours}h
                          {task && <span className="ml-1 font-normal text-slate-500">— {task.title}</span>}
                          {cost != null && <span className="ml-1 font-normal text-slate-400">({fmtMoney(cost)})</span>}
                          {entry.billable === false && (
                            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">non-billable</span>
                          )}
                        </p>
                        {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                        <p className="text-xs text-slate-400">{who}</p>
                      </div>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="shrink-0 rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                        title="Delete entry"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
