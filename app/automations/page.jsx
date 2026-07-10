'use client';

import { useState } from 'react';
import { Zap, Plus, Trash2, X, Loader2, CheckCircle2, XCircle, ListChecks } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useAutomations } from '@/hooks/useAutomations';
import { TRIGGER_TYPES, ACTION_TYPES } from '@/lib/automations';
import { Card, Button, Field, Select, TextInput } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ErrorBanner from '@/components/ui/ErrorBanner';
import AppToast from '@/components/ui/AppToast';
import { cn } from '@/lib/utils';

const TRIGGER_KEYS = Object.keys(TRIGGER_TYPES);
const ACTION_KEYS = Object.keys(ACTION_TYPES);

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Condition row ────────────────────────────────────────────────────────
function ConditionRow({ condition, fields, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <Select className="h-8 w-40 text-xs" value={condition.field} onChange={(e) => onChange({ ...condition, field: e.target.value })}>
        {fields.map((f) => <option key={f} value={f}>{f}</option>)}
      </Select>
      <span className="text-xs text-slate-400">equals</span>
      <TextInput className="h-8 flex-1 text-xs" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} placeholder="value" />
      <button type="button" onClick={onRemove} className="shrink-0 rounded p-1 text-slate-300 hover:text-red-500"><X size={13} /></button>
    </div>
  );
}

// ── Action row — fields shown depend on the action type ────────────────────
function ActionRow({ action, onChange, onRemove }) {
  const set = (patch) => onChange({ ...action, ...patch });
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center gap-2">
        <Select className="h-8 flex-1 text-xs" value={action.type} onChange={(e) => onChange({ type: e.target.value })}>
          {ACTION_KEYS.map((k) => <option key={k} value={k}>{ACTION_TYPES[k].label}</option>)}
        </Select>
        <button type="button" onClick={onRemove} className="shrink-0 rounded p-1 text-slate-300 hover:text-red-500"><X size={13} /></button>
      </div>

      {action.type === 'notify' && (
        <div className="grid grid-cols-2 gap-2">
          <Select className="h-8 text-xs" value={action.target ?? 'creator'} onChange={(e) => set({ target: e.target.value })}>
            <option value="creator">Notify: record creator</option>
            <option value="assignee">Notify: assignee</option>
            <option value="company_admins">Notify: all admins</option>
          </Select>
          <TextInput className="h-8 text-xs" value={action.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder="Message (optional)" />
        </div>
      )}
      {action.type === 'log_activity' && (
        <TextInput className="h-8 w-full text-xs" value={action.label ?? ''} onChange={(e) => set({ label: e.target.value })} placeholder="Activity label (optional)" />
      )}
      {action.type === 'create_task' && (
        <div className="grid grid-cols-2 gap-2">
          <TextInput className="h-8 text-xs" value={action.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Task title" />
          <TextInput className="h-8 text-xs" value={action.role ?? ''} onChange={(e) => set({ role: e.target.value })} placeholder="Role (optional)" />
        </div>
      )}
      {action.type === 'create_ticket' && (
        <div className="grid grid-cols-2 gap-2">
          <TextInput className="h-8 text-xs" value={action.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ticket title" />
          <Select className="h-8 text-xs" value={action.priority ?? 'medium'} onChange={(e) => set({ priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
      )}
    </div>
  );
}

// ── Rule create/edit modal ──────────────────────────────────────────────────
function RuleModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = useState(initial?.trigger_type ?? TRIGGER_KEYS[0]);
  const [conditions, setConditions] = useState(initial?.conditions ?? []);
  const [actions, setActions] = useState(initial?.actions ?? []);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const fields = TRIGGER_TYPES[triggerType]?.fields ?? [];

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (actions.length === 0) { setErr('Add at least one action.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({ name: name.trim(), trigger_type: triggerType, conditions, actions, enabled });
      onClose();
    } catch (ex) { setErr(ex.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{initial ? 'Edit Automation' : 'New Automation'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <Field label="Name *">
            <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notify PM when a CO is approved" />
          </Field>

          <Field label="Trigger">
            <Select value={triggerType} onChange={(e) => { setTriggerType(e.target.value); setConditions([]); }}>
              {TRIGGER_KEYS.map((k) => <option key={k} value={k}>{TRIGGER_TYPES[k].label}</option>)}
            </Select>
          </Field>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">Conditions (all must match — optional)</p>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <ConditionRow key={i} condition={c} fields={fields}
                  onChange={(next) => setConditions(conditions.map((cc, ii) => ii === i ? next : cc))}
                  onRemove={() => setConditions(conditions.filter((_, ii) => ii !== i))} />
              ))}
              <button type="button" onClick={() => setConditions([...conditions, { field: fields[0] ?? '', value: '' }])}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600">
                <Plus size={12} /> Add condition
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">Actions *</p>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <ActionRow key={i} action={a}
                  onChange={(next) => setActions(actions.map((aa, ii) => ii === i ? { ...aa, ...next } : aa))}
                  onRemove={() => setActions(actions.filter((_, ii) => ii !== i))} />
              ))}
              <button type="button" onClick={() => setActions([...actions, { type: 'notify', target: 'creator' }])}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600">
                <Plus size={12} /> Add action
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Automation'}</Button>
        </div>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
function AutomationsContent() {
  const { session, company, user } = useSession();
  const { rules, runs, loading, loadError, refresh, createRule, updateRule, deleteRule } = useAutomations(session, company, user);
  const [tab, setTab] = useState('rules');
  const [modal, setModal] = useState(null); // null | 'new' | rule object
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const handleDelete = (rule) => {
    setConfirmState({
      title: 'Delete automation',
      message: `Delete "${rule.name}"? This cannot be undone.`,
      onConfirm: async () => { await deleteRule(rule.id); setToast({ type: 'success', message: 'Automation deleted.' }); },
    });
  };

  return (
    <div className="p-6 space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900"><Zap size={20} className="text-amber-500" /> Automations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rules.length} rule{rules.length !== 1 ? 's' : ''} · event-driven only (no scheduled/time-based triggers)
          </p>
        </div>
        <Button size="sm" onClick={() => setModal('new')}><Plus size={14} /> New Automation</Button>
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        {[['rules', 'Rules'], ['runs', 'Run Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-all', tab === id ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 size={20} className="animate-spin text-slate-300" /></div>
      ) : tab === 'rules' ? (
        rules.length === 0 ? (
          <Card className="py-16 text-center">
            <Zap size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No automations yet</p>
            <p className="mt-1 text-xs text-slate-400">e.g. &ldquo;When a change order is approved, notify the creator&rdquo;</p>
            <Button size="sm" className="mt-4" onClick={() => setModal('new')}><Plus size={14} /> New Automation</Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <Card key={rule.id} className="group flex items-center gap-4 px-5 py-3.5">
                <button type="button" onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                  title={rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                  className={cn('h-2.5 w-2.5 shrink-0 rounded-full', rule.enabled ? 'bg-emerald-500' : 'bg-slate-300')} />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setModal(rule)}>
                  <p className="truncate text-sm font-semibold text-slate-900">{rule.name}</p>
                  <p className="text-xs text-slate-400">
                    {TRIGGER_TYPES[rule.trigger_type]?.label ?? rule.trigger_type} · {rule.actions?.length ?? 0} action{rule.actions?.length !== 1 ? 's' : ''}
                    {rule.conditions?.length > 0 ? ` · ${rule.conditions.length} condition${rule.conditions.length !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => handleDelete(rule)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              </Card>
            ))}
          </div>
        )
      ) : runs.length === 0 ? (
        <Card className="py-16 text-center">
          <ListChecks size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No runs yet</p>
          <p className="mt-1 text-xs text-slate-400">Runs appear here once an automation&rsquo;s trigger fires.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100">
          {runs.map((run) => (
            <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
              {run.status === 'success'
                ? <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                : <XCircle size={14} className="shrink-0 text-red-500" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-700">{run.automation_rules?.name ?? 'Deleted automation'}</p>
                <p className="text-xs text-slate-400">
                  {TRIGGER_TYPES[run.trigger_type]?.label ?? run.trigger_type}
                  {run.detail ? ` — ${run.detail}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{fmtDate(run.ran_at)}</span>
            </div>
          ))}
        </Card>
      )}

      {modal && (
        <RuleModal
          initial={modal === 'new' ? null : modal}
          onSave={async (data) => {
            if (modal === 'new') { await createRule(data); setToast({ type: 'success', message: 'Automation created.' }); }
            else { await updateRule(modal.id, data); setToast({ type: 'success', message: 'Automation updated.' }); }
          }}
          onClose={() => setModal(null)}
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

export default function AutomationsPage() {
  return <AuthGuard><OSShell><AutomationsContent /></OSShell></AuthGuard>;
}
