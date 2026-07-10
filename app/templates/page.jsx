'use client';

import { useState } from 'react';
import {
  Plus,
  LayoutTemplate,
  ChevronDown,
  ChevronRight,
  Trash2,
  Pencil,
  Clock,
  User,
  Copy,
  X,
  Check,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useTemplates } from '@/hooks/useTemplates';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { Card, Button, Field, TextInput, Select } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { TECHNOLOGIES } from '@/lib/templates/index';
import { cn } from '@/lib/utils';

// ---- Inline edit ----
function InlineEdit({ value, onSave, className, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    else setDraft(value);
    setEditing(false);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={cn('rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-500/20', className)}
      />
    );
  }
  return (
    <span onClick={() => { setDraft(value); setEditing(true); }} className={cn('cursor-text rounded px-0.5 hover:bg-slate-100', className)} title="Click to edit">
      {value || <span className="text-slate-400">{placeholder}</span>}
    </span>
  );
}

// ---- Task row (editable) ----
function EditableTaskRow({ task, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-slate-100 bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button type="button" onClick={() => setExpanded((o) => !o)} className="shrink-0 text-slate-300 hover:text-slate-500">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="flex-1 min-w-0">
          <InlineEdit value={task.name} onSave={(v) => onUpdate(task.id, { name: v })} className="text-sm text-slate-700" placeholder="Task name…" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={11} />
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={task.duration_days}
              onChange={(e) => onUpdate(task.id, { duration_days: parseFloat(e.target.value) || 1 })}
              className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-center outline-none focus:border-blue-400"
            />
            d
          </label>
          <select
            value={task.role}
            onChange={(e) => onUpdate(task.id, { role: e.target.value })}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-500 outline-none focus:border-blue-400"
          >
            <option value="">— role —</option>
            <option value="PM">PM</option>
            <option value="Tech Lead">Tech Lead</option>
            <option value="Field Tech">Field Tech</option>
            <option value="Subcontractor">Subcontractor</option>
          </select>
          <button type="button" onClick={() => onDelete(task.id)} className="text-slate-300 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2">
          <p className="mb-1 text-xs font-medium text-slate-500">Scope of Work</p>
          <textarea
            value={task.description ?? ''}
            onChange={(e) => onUpdate(task.id, { description: e.target.value })}
            rows={4}
            placeholder="Describe what needs to be done, acceptance criteria, and notes…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
          />
        </div>
      )}
    </div>
  );
}

// ---- Phase block (editable) ----
function PhaseBlock({ phase, templateId, onUpdatePhase, onDeletePhase, onAddTask, onUpdateTask, onDeleteTask }) {
  const [open, setOpen] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');

  const commitTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    await onAddTask(phase.id, templateId, { name, order_index: (phase.tasks ?? []).length * 10 });
    setNewTaskName('');
    setAddingTask(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 text-slate-400">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <InlineEdit
          value={phase.name}
          onSave={(v) => onUpdatePhase(phase.id, { name: v })}
          className="flex-1 text-sm font-semibold text-slate-800"
          placeholder="Phase name…"
        />
        <span className="text-xs text-slate-400">
          {(phase.tasks ?? []).length} tasks · {(phase.tasks ?? []).reduce((s, t) => s + Number(t.duration_days ?? 1), 0)}d
        </span>
        <button type="button" onClick={() => onDeletePhase(phase.id)} className="shrink-0 text-slate-300 hover:text-red-500 rounded p-1">
          <Trash2 size={13} />
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-1.5">
          {(phase.tasks ?? []).map((task) => (
            <EditableTaskRow
              key={task.id}
              task={task}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
            />
          ))}
          {addingTask ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onBlur={commitTask}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTask(); if (e.key === 'Escape') { setNewTaskName(''); setAddingTask(false); } }}
                placeholder="Task name…"
                className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTask(true)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Plus size={12} /> Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Template card (editable) ----
function TemplateCard({ template, canEdit, onClone, onDelete, onUpdateTemplate, onAddPhase, onUpdatePhase, onDeletePhase, onAddTask, onUpdateTask, onDeleteTask }) {
  const [expanded, setExpanded] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');

  const totalDays = template.phases.reduce((s, p) => s + p.tasks.reduce((ts, t) => ts + Number(t.duration_days ?? 1), 0), 0);
  const totalTasks = template.phases.reduce((s, p) => s + p.tasks.length, 0);

  const commitPhase = async () => {
    const name = newPhaseName.trim();
    if (!name) return;
    await onAddPhase(template.id, { name, order_index: template.phases.length * 10 });
    setNewPhaseName('');
    setAddingPhase(false);
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer items-center gap-3 px-5 py-4 hover:bg-slate-50/60"
        onClick={() => setExpanded((o) => !o)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <LayoutTemplate size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <InlineEdit
                value={template.name}
                onSave={(v) => onUpdateTemplate(template.id, { name: v })}
                className="text-sm font-semibold text-slate-800"
              />
            ) : (
              <span className="text-sm font-semibold text-slate-800">{template.name}</span>
            )}
            {template.isSystem && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-600">System</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {template.technology} · {template.phases.length} phases · {totalTasks} tasks · ~{totalDays} days
          </p>
          {template.description && (
            <p className="mt-0.5 truncate text-xs text-slate-400">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onClone(template)}
            title="Clone template"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Copy size={14} />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onDelete(template.id, template.name)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="shrink-0 text-slate-300">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          {template.phases.map((phase) => (
            <PhaseBlock
              key={phase.id ?? phase.name}
              phase={phase}
              templateId={template.id}
              onUpdatePhase={canEdit ? onUpdatePhase : () => {}}
              onDeletePhase={canEdit ? onDeletePhase : () => {}}
              onAddTask={canEdit ? onAddTask : () => {}}
              onUpdateTask={canEdit ? onUpdateTask : () => {}}
              onDeleteTask={canEdit ? onDeleteTask : () => {}}
            />
          ))}
          {canEdit && (
            addingPhase ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  onBlur={commitPhase}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitPhase(); if (e.key === 'Escape') { setNewPhaseName(''); setAddingPhase(false); } }}
                  placeholder="Phase name…"
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingPhase(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={13} /> Add phase
              </button>
            )
          )}
        </div>
      )}
    </Card>
  );
}

// ---- New template modal ----
function NewTemplateModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', technology: 'Managed Wi-Fi', description: '' });
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onCreate(form); onClose(); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold">New Template</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <Field label="Template Name *">
            <TextInput autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Multi-Family Wi-Fi Deployment" required />
          </Field>
          <Field label="Technology">
            <Select value={form.technology} onChange={(e) => set('technology', e.target.value)}>
              {TECHNOLOGIES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Description">
            <TextInput value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Brief description of when to use this template" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Template'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Page ----
function TemplatesContent() {
  const { session, company, user } = useSession();
  const {
    allTemplates,
    systemTemplates,
    companyTemplates,
    loading,
    loadError,
    refresh,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addPhase,
    updatePhase,
    deletePhase,
    addTask,
    updateTask,
    deleteTask,
    cloneSystemTemplate,
  } = useTemplates(session, company, user);

  const [activeTab, setActiveTab] = useState('all');
  const [techFilter, setTechFilter] = useState('');
  const [newModal, setNewModal] = useState(false);
  const [cloning, setCloning] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const handleDeleteTemplate = (id, name) => {
    setConfirmState({
      title: 'Delete template',
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: () => deleteTemplate(id),
    });
  };

  const handleClone = async (template) => {
    setCloning(template.id);
    try {
      if (template.isSystem) {
        await cloneSystemTemplate(template);
      } else {
        // Clone a company template
        const copy = await createTemplate({
          name: `${template.name} (Copy)`,
          description: template.description,
          technology: template.technology,
        });
        for (const phase of template.phases) {
          const ph = await addPhase(copy.id, { name: phase.name, order_index: phase.order ?? phase.order_index ?? 0 });
          for (const task of phase.tasks) {
            await addTask(ph.id, copy.id, {
              name: task.name,
              description: task.description ?? '',
              duration_days: task.duration_days ?? 1,
              role: task.role ?? '',
              order_index: task.order ?? task.order_index ?? 0,
            });
          }
        }
      }
    } finally {
      setCloning(null);
    }
  };

  const displayed = allTemplates
    .filter((t) => activeTab === 'all' || (activeTab === 'system' ? t.isSystem : !t.isSystem))
    .filter((t) => !techFilter || t.technology === techFilter);

  const techs = [...new Set(allTemplates.map((t) => t.technology))].sort();

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Project Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Reusable task plans — apply to any project technology section to pre-populate phases and tasks.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewModal(true)}>
          <Plus size={14} /> New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
          {['all', 'system', 'company'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all',
                activeTab === t ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {t === 'all' ? 'All' : t === 'system' ? 'System' : 'My Templates'}
            </button>
          ))}
        </div>
        <select
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-600 shadow-sm outline-none focus:border-blue-400"
        >
          <option value="">All Technologies</option>
          {techs.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Template list */}
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading templates…</p>
      ) : displayed.length === 0 ? (
        <Card className="py-16 text-center">
          <LayoutTemplate size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No templates found</p>
          <p className="mt-1 text-sm text-slate-400">
            {activeTab === 'company' ? 'Create a template or clone a system template to get started.' : 'No templates match the current filter.'}
          </p>
          {activeTab === 'company' && (
            <Button size="sm" className="mt-4" onClick={() => setNewModal(true)}>
              <Plus size={14} /> New Template
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              canEdit={!template.isSystem}
              onClone={handleClone}
              onDelete={handleDeleteTemplate}
              onUpdateTemplate={updateTemplate}
              onAddPhase={addPhase}
              onUpdatePhase={updatePhase}
              onDeletePhase={deletePhase}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
            />
          ))}
        </div>
      )}

      <NewTemplateModal
        open={newModal}
        onClose={() => setNewModal(false)}
        onCreate={createTemplate}
      />
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

export default function TemplatesPage() {
  return (
    <AuthGuard>
      <OSShell>
        <TemplatesContent />
      </OSShell>
    </AuthGuard>
  );
}
