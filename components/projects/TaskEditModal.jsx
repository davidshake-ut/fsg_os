'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Card, Button, Field, TextInput, Select, NumberInput } from '@/components/ui/primitives';

// The one Edit Task dialog — opened from the task list, the Kanban board,
// and the Gantt chart. Saves only the fields that changed via updateTask,
// so every view (they all read the same usePSAProject task store) reflects
// the edit immediately, and the dependency date cascade still applies.
export default function TaskEditModal({ task, members = [], milestones = [], columns = [], onSave, onClose }) {
  const [form, setForm] = useState({
    title: task.title ?? '',
    description: task.description ?? '',
    status: task.status ?? 'todo',
    assignee_id: task.assignee_id ?? '',
    milestone_id: task.milestone_id ?? '',
    role: task.role ?? '',
    start_date: task.start_date ?? '',
    due_date: task.due_date ?? '',
    estimated_hours: task.estimated_hours ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The task's status may reference a column that was since deleted — keep
  // it selectable so opening + saving without touching status is a no-op.
  const statusOptions = columns.some((c) => c.id === form.status)
    ? columns
    : [...columns, { id: form.status, label: form.status }];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const patch = {};
      const norm = (v) => (v === '' ? null : v);
      if (form.title.trim() && form.title !== task.title) patch.title = form.title.trim();
      if (form.description !== (task.description ?? '')) patch.description = form.description;
      if (form.status !== task.status) patch.status = form.status;
      if (norm(form.assignee_id) !== (task.assignee_id ?? null)) patch.assignee_id = norm(form.assignee_id);
      if (norm(form.milestone_id) !== (task.milestone_id ?? null)) patch.milestone_id = norm(form.milestone_id);
      if (form.role !== (task.role ?? '')) patch.role = form.role;
      if (norm(form.start_date) !== (task.start_date ?? null)) patch.start_date = norm(form.start_date);
      if (norm(form.due_date) !== (task.due_date ?? null)) patch.due_date = norm(form.due_date);
      const hours = form.estimated_hours === '' ? null : Number(form.estimated_hours);
      if (hours !== (task.estimated_hours != null ? Number(task.estimated_hours) : null)) {
        patch.estimated_hours = hours;
      }
      if (Object.keys(patch).length > 0) await onSave(patch);
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <Card className="w-full max-w-md p-5" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Edit Task</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} required autoFocus />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => set('status')(e.target.value)}>
                {statusOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={form.assignee_id} onChange={(e) => set('assignee_id')(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phase / Milestone">
              <Select value={form.milestone_id} onChange={(e) => set('milestone_id')(e.target.value)}>
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role">
              <TextInput value={form.role} onChange={(e) => set('role')(e.target.value)} placeholder="e.g. Field Tech" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start">
              <TextInput type="date" value={form.start_date} onChange={(e) => set('start_date')(e.target.value)} />
            </Field>
            <Field label="Due">
              <TextInput type="date" value={form.due_date} onChange={(e) => set('due_date')(e.target.value)} />
            </Field>
            <Field label="Est. hours">
              <NumberInput value={form.estimated_hours} onChange={set('estimated_hours')} />
            </Field>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : 'Save Task'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
