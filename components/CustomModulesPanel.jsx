'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Card, Select, Button, TextInput, Field } from '@/components/ui/primitives';
import { DEFAULT_MODULE_CONFIG } from '@/lib/moduleConfig';
import { cn } from '@/lib/utils';

const BASE_MODULES = Object.entries(DEFAULT_MODULE_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

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
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">
                        Deeper customization (stages, features, fields) arrives per module — CRM first.
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
