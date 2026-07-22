'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Boxes, ChevronDown, Copy, Lock, Plus, Trash2, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Card, Select, Button, TextInput, Field } from '@/components/ui/primitives';
import { DEFAULT_MODULE_CONFIG, resolveModuleConfig } from '@/lib/moduleConfig';
import { toneClasses } from '@/lib/statusColors';
import { cn } from '@/lib/utils';

const BASE_MODULES = Object.entries(DEFAULT_MODULE_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

// ── CRM deep knobs (Phase B) ────────────────────────────────────────────────

const STAGE_TONES = ['neutral', 'info', 'progress', 'warning', 'success', 'danger'];
// Semantic anchors — automations and next-step rules key off these ids.
const LOCKED_STAGE_IDS = new Set(['won', 'lost']);

function slugId(prefix, label, existingIds) {
  let base = `${prefix}_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  if (base === `${prefix}_`) base = `${prefix}_item`;
  let id = base;
  let i = 2;
  while (existingIds.has(id)) id = `${base}_${i++}`;
  return id;
}

// ── Custom field definitions (Phase D) — shared by all four editors ────────

const FIELD_TYPES = ['text', 'number', 'date', 'select'];

function FieldDefsEditor({ value = [], onChange, entityLabel }) {
  const [newLabel, setNewLabel] = useState('');
  const patch = (key, p) => onChange(value.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const remove = (key) => onChange(value.filter((f) => f.key !== key));
  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    onChange([
      ...value,
      { key: slugId('cf', label, new Set(value.map((f) => f.key))), label, type: 'text', options: [] },
    ]);
    setNewLabel('');
  };

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Custom fields <span className="normal-case text-slate-300">(on each {entityLabel})</span>
      </p>
      <div className="space-y-1.5">
        {value.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-1.5">
            <TextInput className="h-8 min-w-[130px] flex-1" value={f.label} onChange={(e) => patch(f.key, { label: e.target.value })} />
            <Select className="h-8 w-24 text-xs" value={f.type} onChange={(e) => patch(f.key, { type: e.target.value })}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            {f.type === 'select' && (
              <TextInput
                className="h-8 min-w-[150px] flex-1 text-xs"
                value={(f.options ?? []).join(', ')}
                onChange={(e) => patch(f.key, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Options, comma-separated"
              />
            )}
            <button type="button" aria-label={`Remove ${f.label}`} onClick={() => remove(f.key)}
              className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
              <X size={13} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <TextInput
            className="h-8 flex-1"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New field name… (e.g. Permit #)"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={!newLabel.trim()}>
            <Plus size={12} /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

const CARD_OPTIONS = [
  { key: 'nextSteps', label: '“What to do next” panel' },
  { key: 'stats', label: 'Stat tiles' },
  { key: 'projects', label: 'Projects card' },
  { key: 'billing', label: 'Billing card' },
  { key: 'cases', label: 'Support cases card' },
  { key: 'contacts', label: 'Contacts card' },
];

// ── Projects knobs (Phase C) ────────────────────────────────────────────────

const PROJECT_FEATURES = [
  { key: 'gantt', label: 'Gantt chart view' },
  { key: 'dependencies', label: 'Task dependencies' },
  { key: 'checklists', label: 'Task checklists' },
  { key: 'budgetSplit', label: 'Equipment / Labor budget split' },
];

function ProjectsVariantEditor({ variant, busy, onSaveConfig }) {
  const resolved = resolveModuleConfig('projects', variant.config);
  const [features, setFeatures] = useState({ ...resolved.features });
  const [fields, setFields] = useState(resolved.fields ?? []);
  const [columns, setColumns] = useState(
    resolved.defaultColumns ?? [
      { id: 'todo', label: 'To Do' },
      { id: 'in_progress', label: 'In Progress' },
      { id: 'done', label: 'Done' },
    ]
  );
  const [newCol, setNewCol] = useState('');
  const [dirty, setDirty] = useState(false);

  const middles = columns.filter((c) => c.id !== 'todo' && c.id !== 'done');
  const anchor = (id) => columns.find((c) => c.id === id);

  const setCol = (id, label) => { setDirty(true); setColumns((l) => l.map((c) => (c.id === id ? { ...c, label } : c))); };
  const removeCol = (id) => { setDirty(true); setColumns((l) => l.filter((c) => c.id !== id)); };
  const moveCol = (id, dir) => {
    setDirty(true);
    setColumns(() => {
      const m = [...middles];
      const i = m.findIndex((c) => c.id === id);
      const t = i + dir;
      if (i === -1 || t < 0 || t >= m.length) return columns;
      [m[i], m[t]] = [m[t], m[i]];
      return [anchor('todo'), ...m, anchor('done')].filter(Boolean);
    });
  };
  const addCol = () => {
    const label = newCol.trim();
    if (!label) return;
    setDirty(true);
    setColumns((l) => {
      const id = slugId('col', label, new Set(l.map((c) => c.id)));
      return [...l.filter((c) => c.id !== 'done'), { id, label }, anchor('done')].filter(Boolean);
    });
    setNewCol('');
  };

  const save = () => {
    onSaveConfig({
      ...(variant.config ?? {}),
      features,
      defaultColumns: [anchor('todo'), ...middles, anchor('done')].filter(Boolean),
      fields,
    });
    setDirty(false);
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold text-slate-600">Projects customization</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Features</p>
          <div className="space-y-1">
            {PROJECT_FEATURES.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={features[f.key] !== false}
                  onChange={(e) => { setDirty(true); setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked })); }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Default board columns <span className="normal-case text-slate-300">(new projects)</span>
          </p>
          <div className="space-y-1.5">
            {['todo', ...middles.map((c) => c.id), 'done'].map((id) => {
              const c = columns.find((x) => x.id === id);
              if (!c) return null;
              const isAnchor = id === 'todo' || id === 'done';
              const mi = middles.findIndex((x) => x.id === id);
              return (
                <div key={id} className="flex items-center gap-1.5">
                  {isAnchor ? (
                    <span className="w-[26px] shrink-0" />
                  ) : (
                    <span className="flex shrink-0 flex-col">
                      <button type="button" aria-label="Move up" disabled={mi === 0} onClick={() => moveCol(id, -1)} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"><ArrowUp size={11} /></button>
                      <button type="button" aria-label="Move down" disabled={mi === middles.length - 1} onClick={() => moveCol(id, 1)} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30"><ArrowDown size={11} /></button>
                    </span>
                  )}
                  <TextInput className="h-8 flex-1" value={c.label} onChange={(e) => setCol(id, e.target.value)} />
                  {isAnchor ? (
                    <span className="p-1 text-slate-300" title={`"${id}" is a system column — completion metrics depend on it. Rename freely; it can't be removed.`}>
                      <Lock size={12} />
                    </span>
                  ) : (
                    <button type="button" aria-label={`Remove ${c.label}`} onClick={() => removeCol(id)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"><X size={13} /></button>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-1.5">
              <span className="w-[26px] shrink-0" />
              <TextInput
                className="h-8 flex-1"
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
                placeholder="New column…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCol(); } }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addCol} disabled={!newCol.trim()}><Plus size={12} /></Button>
            </div>
          </div>
        </div>
      </div>
      <FieldDefsEditor value={fields} onChange={(v) => { setDirty(true); setFields(v); }} entityLabel="project" />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save Projects settings'}
        </Button>
      </div>
    </div>
  );
}

// ── Support knobs (Phase C) ─────────────────────────────────────────────────

const SUPPORT_STATUS_IDS = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
const SUPPORT_PRIORITY_IDS = ['low', 'medium', 'high', 'critical'];

function SupportVariantEditor({ variant, busy, onSaveConfig }) {
  const resolved = resolveModuleConfig('support', variant.config);
  const [statuses, setStatuses] = useState({ ...resolved.statuses });
  const [priorities, setPriorities] = useState({ ...resolved.priorities });
  const [fields, setFields] = useState(resolved.fields ?? []);
  const [dirty, setDirty] = useState(false);

  const labelRow = (ids, values, setter) => (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-300">{id.replace(/_/g, ' ')}</span>
          <input
            value={values[id] ?? id}
            onChange={(e) => { setDirty(true); setter((prev) => ({ ...prev, [id]: e.target.value })); }}
            className="h-7 w-24 bg-transparent text-xs outline-none"
          />
        </span>
      ))}
    </div>
  );

  const save = () => {
    onSaveConfig({ ...(variant.config ?? {}), statuses, priorities, fields });
    setDirty(false);
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold text-slate-600">Support customization</p>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status labels</p>
        {labelRow(SUPPORT_STATUS_IDS, statuses, setStatuses)}
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Priority labels</p>
        {labelRow(SUPPORT_PRIORITY_IDS, priorities, setPriorities)}
      </div>
      <p className="text-[11px] text-slate-400">
        Labels only — the underlying statuses keep their meaning (SLA logic and automations depend on them).
      </p>
      <FieldDefsEditor value={fields} onChange={(v) => { setDirty(true); setFields(v); }} entityLabel="case" />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save Support settings'}
        </Button>
      </div>
    </div>
  );
}

// ── Invoices knobs (Phase C) ────────────────────────────────────────────────

function InvoicesVariantEditor({ variant, busy, onSaveConfig }) {
  const resolved = resolveModuleConfig('invoices', variant.config);
  const [prefix, setPrefix] = useState(resolved.numberPrefix ?? 'INV');
  const [tax, setTax] = useState({ ...resolved.tax });
  const [fields, setFields] = useState(resolved.fields ?? []);
  const [dirty, setDirty] = useState(false);

  const save = () => {
    const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10) || 'INV';
    onSaveConfig({
      ...(variant.config ?? {}),
      numberPrefix: clean,
      tax: {
        stateEnabled: !!tax.stateEnabled,
        stateRate: Math.max(0, Number(tax.stateRate) || 0),
        localEnabled: !!tax.localEnabled,
        localRate: Math.max(0, Number(tax.localRate) || 0),
      },
      fields,
    });
    setPrefix(clean);
    setDirty(false);
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold text-slate-600">Invoices customization</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice number prefix" sub={`New invoices number as ${(prefix.trim() || 'INV').toUpperCase()}-2026-0001`}>
          <TextInput className="w-32" value={prefix} onChange={(e) => { setDirty(true); setPrefix(e.target.value); }} placeholder="INV" />
        </Field>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Tax defaults <span className="normal-case text-slate-300">(new invoices)</span>
          </p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!tax.stateEnabled} onChange={(e) => { setDirty(true); setTax((t) => ({ ...t, stateEnabled: e.target.checked })); }} />
              State tax
              {tax.stateEnabled && (
                <TextInput type="number" min="0" step="0.01" className="h-7 w-20 text-xs" value={tax.stateRate}
                  onChange={(e) => { setDirty(true); setTax((t) => ({ ...t, stateRate: e.target.value })); }} placeholder="%" />
              )}
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!tax.localEnabled} onChange={(e) => { setDirty(true); setTax((t) => ({ ...t, localEnabled: e.target.checked })); }} />
              Local tax
              {tax.localEnabled && (
                <TextInput type="number" min="0" step="0.01" className="h-7 w-20 text-xs" value={tax.localRate}
                  onChange={(e) => { setDirty(true); setTax((t) => ({ ...t, localRate: e.target.value })); }} placeholder="%" />
              )}
            </label>
          </div>
        </div>
      </div>
      <FieldDefsEditor value={fields} onChange={(v) => { setDirty(true); setFields(v); }} entityLabel="invoice" />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save Invoices settings'}
        </Button>
      </div>
    </div>
  );
}

function CrmVariantEditor({ variant, busy, onSaveConfig }) {
  const resolved = resolveModuleConfig('crm', variant.config);
  const [stages, setStages] = useState(resolved.stages);
  const [types, setTypes] = useState(resolved.accountTypes);
  const [cards, setCards] = useState({ ...resolved.cards });
  const [staleDays, setStaleDays] = useState(resolved.nextSteps?.staleSentDays ?? 7);
  const [fields, setFields] = useState(resolved.fields ?? []);
  const [newStage, setNewStage] = useState('');
  const [newType, setNewType] = useState('');
  const [dirty, setDirty] = useState(false);

  const journey = stages.filter((s) => !LOCKED_STAGE_IDS.has(s.id));
  const locked = stages.filter((s) => LOCKED_STAGE_IDS.has(s.id));

  const touch = (fn) => (...args) => { setDirty(true); fn(...args); };

  const setStage = touch((id, patch) =>
    setStages((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))));
  const removeStage = touch((id) =>
    setStages((list) => list.filter((s) => s.id !== id)));
  const moveStage = touch((id, dir) =>
    setStages((list) => {
      const j = list.filter((s) => !LOCKED_STAGE_IDS.has(s.id));
      const i = j.findIndex((s) => s.id === id);
      const t = i + dir;
      if (i === -1 || t < 0 || t >= j.length) return list;
      [j[i], j[t]] = [j[t], j[i]];
      return [...j, ...list.filter((s) => LOCKED_STAGE_IDS.has(s.id))];
    }));
  const addStage = touch(() => {
    const label = newStage.trim();
    if (!label) return;
    setStages((list) => {
      const j = list.filter((s) => !LOCKED_STAGE_IDS.has(s.id));
      const l = list.filter((s) => LOCKED_STAGE_IDS.has(s.id));
      const id = slugId('st', label, new Set(list.map((s) => s.id)));
      return [...j, { id, label, tone: 'info' }, ...l];
    });
    setNewStage('');
  });

  const setType = touch((id, label) =>
    setTypes((list) => list.map((t) => (t.id === id ? { ...t, label } : t))));
  const removeType = touch((id) => setTypes((list) => list.filter((t) => t.id !== id)));
  const addType = touch(() => {
    const label = newType.trim();
    if (!label) return;
    setTypes((list) => [...list, { id: slugId('ty', label, new Set(list.map((t) => t.id))), label }]);
    setNewType('');
  });

  const save = () => {
    // Journey order as edited; Won then Lost always anchor the end.
    const won = stages.find((s) => s.id === 'won');
    const lost = stages.find((s) => s.id === 'lost');
    onSaveConfig({
      ...(variant.config ?? {}),
      stages: [...journey, won, lost].filter(Boolean),
      accountTypes: types,
      cards,
      nextSteps: { staleSentDays: Math.max(1, Number(staleDays) || 7) },
      fields,
    });
    setDirty(false);
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold text-slate-600">CRM customization</p>

      {/* Pipeline stages */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pipeline stages</p>
        <div className="space-y-1.5">
          {journey.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="flex shrink-0 flex-col">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveStage(s.id, -1)} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ArrowUp size={11} />
                </button>
                <button type="button" aria-label="Move down" disabled={i === journey.length - 1} onClick={() => moveStage(s.id, 1)} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30">
                  <ArrowDown size={11} />
                </button>
              </span>
              <TextInput className="h-8 flex-1" value={s.label} onChange={(e) => setStage(s.id, { label: e.target.value })} />
              <Select className="h-8 w-28 text-xs" value={s.tone} onChange={(e) => setStage(s.id, { tone: e.target.value })}>
                {STAGE_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <span className={cn('h-4 w-4 shrink-0 rounded-full', toneClasses(s.tone))} />
              <button
                type="button"
                aria-label={`Remove ${s.label}`}
                disabled={journey.length <= 1}
                onClick={() => removeStage(s.id)}
                className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {locked.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 opacity-90">
              <span className="w-[26px] shrink-0" />
              <TextInput className="h-8 flex-1" value={s.label} onChange={(e) => setStage(s.id, { label: e.target.value })} />
              <Select className="h-8 w-28 text-xs" value={s.tone} onChange={(e) => setStage(s.id, { tone: e.target.value })}>
                {STAGE_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <span className={cn('h-4 w-4 shrink-0 rounded-full', toneClasses(s.tone))} />
              <span className="p-1 text-slate-300" title={`"${s.id}" is a system stage — automations depend on it. Rename freely; it can't be removed.`}>
                <Lock size={12} />
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="w-[26px] shrink-0" />
            <TextInput
              className="h-8 flex-1"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              placeholder="New stage name…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
            />
            <Button type="button" size="sm" variant="outline" onClick={addStage} disabled={!newStage.trim()}>
              <Plus size={12} /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Account types */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Account types</p>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <span key={t.id} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2 pr-1">
              <input
                value={t.label}
                onChange={(e) => setType(t.id, e.target.value)}
                className="h-7 w-28 bg-transparent text-xs outline-none"
              />
              <button
                type="button"
                aria-label={`Remove ${t.label}`}
                disabled={types.length <= 1}
                onClick={() => removeType(t.id)}
                className="rounded p-0.5 text-slate-300 hover:text-red-500 disabled:opacity-30"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <TextInput
              className="h-8 w-32 text-xs"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="New type…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addType(); } }}
            />
            <Button type="button" size="sm" variant="outline" onClick={addType} disabled={!newType.trim()}>
              <Plus size={12} />
            </Button>
          </span>
        </div>
      </div>

      {/* 360 page cards + next-step tuning */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customer page sections</p>
          <div className="space-y-1">
            {CARD_OPTIONS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={cards[c.key] !== false}
                  onChange={(e) => { setDirty(true); setCards((prev) => ({ ...prev, [c.key]: e.target.checked })); }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <Field label="Proposal follow-up nudge (days)" sub="How long a sent proposal sits before “What to do next” flags it">
          <TextInput
            type="number" min="1" max="60" step="1"
            className="w-24"
            value={staleDays}
            onChange={(e) => { setDirty(true); setStaleDays(e.target.value); }}
          />
        </Field>
      </div>

      <FieldDefsEditor value={fields} onChange={(v) => { setDirty(true); setFields(v); }} entityLabel="customer" />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save CRM settings'}
        </Button>
      </div>
    </div>
  );
}

// Custom Modules (Phase A) — super-admin-only registry of module variants.
// A variant with no overrides IS a faithful clone of the stock module; the
// Display Name knob is the first overlay (deeper knobs land per module in
// later phases). Assignment to teams happens in the Modules panel below.
export default function CustomModulesPanel() {
  const { isSuperAdmin } = useSession();
  const supabase = getSupabase();

  const [variants, setVariants] = useState([]);
  const [usage, setUsage] = useState({}); // variantId -> team count
  const [expandedId, setExpandedId] = useState(null);
  const [cloneBase, setCloneBase] = useState('projects');
  const [cloneName, setCloneName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: rows }, { data: assignments }] = await Promise.all([
      supabase.from('module_variants').select('*').order('base_module').order('name'),
      supabase.from('company_modules').select('variant_id').not('variant_id', 'is', null),
    ]);
    setVariants(rows ?? []);
    const counts = {};
    for (const a of assignments ?? []) counts[a.variant_id] = (counts[a.variant_id] ?? 0) + 1;
    setUsage(counts);
  }, [supabase]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void (async () => { await load(); })();
  }, [isSuperAdmin, load]);

  if (!isSuperAdmin) return null;

  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clone = () =>
    run(async () => {
      const name = cloneName.trim();
      if (!name) return;
      const { error } = await supabase
        .from('module_variants')
        .insert({ base_module: cloneBase, name, config: {} });
      if (error) throw error;
      setCloneName('');
    });

  const patchVariant = (id, patch) =>
    run(async () => {
      const { error } = await supabase
        .from('module_variants')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    });

  const removeVariant = (id) =>
    run(async () => {
      // Teams referencing it fall back to the stock module (FK on delete set null).
      const { error } = await supabase.from('module_variants').delete().eq('id', id);
      if (error) throw error;
      setConfirmDeleteId(null);
    });

  const baseLabel = (key) => DEFAULT_MODULE_CONFIG[key]?.label ?? key;

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Boxes size={16} /> Custom Modules
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Clone a module, rename it, and assign it to specific teams in Module Configuration below.
        A fresh clone behaves exactly like the original until you change something.
      </p>

      {/* Clone form */}
      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
        <Field label="Base module" className="min-w-[150px]">
          <Select value={cloneBase} onChange={(e) => setCloneBase(e.target.value)}>
            {BASE_MODULES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="New module name" className="min-w-[180px] flex-1">
          <TextInput
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            placeholder="e.g. HVAC Projects, Roofing CRM…"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); clone(); } }}
          />
        </Field>
        <Button type="button" onClick={clone} disabled={busy || !cloneName.trim()}>
          <Copy size={13} /> Clone
        </Button>
      </div>

      {err && <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {/* Variant list */}
      {variants.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Plus size={14} /> No custom modules yet — clone one above to get started.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-slate-100">
          {variants.map((v) => {
            const open = expandedId === v.id;
            const teams = usage[v.id] ?? 0;
            return (
              <div key={v.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : v.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <ChevronDown size={14} className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{v.name}</span>
                  <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                    {baseLabel(v.base_module)}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {teams} team{teams !== 1 ? 's' : ''}
                  </span>
                </button>

                {open && (
                  <div className="ml-6 mt-2 space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <Field label="Name" sub="How this custom module is listed here and in team assignment">
                      <TextInput
                        defaultValue={v.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== v.name) patchVariant(v.id, { name });
                        }}
                      />
                    </Field>
                    <Field label="Display name" sub="What assigned teams see in the sidebar and page headers (blank = stock name)">
                      <TextInput
                        defaultValue={v.config?.label ?? ''}
                        placeholder={baseLabel(v.base_module)}
                        onBlur={(e) => {
                          const label = e.target.value.trim();
                          const next = { ...(v.config ?? {}) };
                          if (label) next.label = label;
                          else delete next.label;
                          patchVariant(v.id, { config: next });
                        }}
                      />
                    </Field>
                    {v.base_module === 'crm' && (
                      <CrmVariantEditor key={v.id} variant={v} busy={busy} onSaveConfig={(config) => patchVariant(v.id, { config })} />
                    )}
                    {v.base_module === 'projects' && (
                      <ProjectsVariantEditor key={v.id} variant={v} busy={busy} onSaveConfig={(config) => patchVariant(v.id, { config })} />
                    )}
                    {v.base_module === 'support' && (
                      <SupportVariantEditor key={v.id} variant={v} busy={busy} onSaveConfig={(config) => patchVariant(v.id, { config })} />
                    )}
                    {v.base_module === 'invoices' && (
                      <InvoicesVariantEditor key={v.id} variant={v} busy={busy} onSaveConfig={(config) => patchVariant(v.id, { config })} />
                    )}

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">
                        {['crm', 'projects', 'support', 'invoices'].includes(v.base_module)
                          ? 'Changes apply to every team assigned this module.'
                          : 'This module currently supports the Display Name knob; deeper customization arrives later.'}
                      </p>
                      {confirmDeleteId === v.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            {teams > 0 ? `${teams} team${teams !== 1 ? 's' : ''} fall back to the stock module.` : 'Delete this custom module?'}
                          </span>
                          <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => removeVariant(v.id)}>
                            Delete
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" className="!text-red-600 hover:!bg-red-50" onClick={() => setConfirmDeleteId(v.id)}>
                          <Trash2 size={13} /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
