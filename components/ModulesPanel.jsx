'use client';

import { useCallback, useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Card, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const MODULES = [
  { key: 'dashboard', label: 'Dashboard',          description: 'KPI dashboard and real-time business metrics' },
  { key: 'crm',       label: 'CRM',                description: 'Customer accounts, contacts, and opportunities' },
  { key: 'builder',   label: 'System Builder',     description: 'CPQ — configure, price, and quote systems' },
  { key: 'projects',  label: 'Project Management', description: 'PSA — project tracking, scheduling, and resource management' },
  { key: 'support',   label: 'Customer Support',   description: 'Case system with alerts and SLA tracking' },
  { key: 'invoices',  label: 'Invoices',           description: 'Create and send invoices tied to projects and quotes' },
  { key: 'resources', label: 'Resources',           description: 'Knowledge base, guides, and team tools' },
  { key: 'messages',  label: 'Message Center',      description: 'Direct messages, group channels, and project channels' },
];

function ModuleToggle({ label, description, checked, onChange, saving, variants = [], variantId = null, onSetVariant }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {variants.length > 0 && (
          <Select
            className="h-7 w-40 text-xs"
            value={variantId ?? ''}
            onChange={(e) => onSetVariant(e.target.value || null)}
            title="Which version of this module the team runs"
          >
            <option value="">Standard</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
        )}
        {saving && <span className="text-[11px] text-slate-400">saving…</span>}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
            checked ? 'bg-blue-600' : 'bg-slate-300'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
              checked ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>
    </div>
  );
}

export default function ModulesPanel({ companies }) {
  const { isSuperAdmin } = useSession();
  const supabase = getSupabase();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [moduleStates, setModuleStates] = useState({});
  const [variantStates, setVariantStates] = useState({}); // module_key -> variant_id
  const [allVariants, setAllVariants] = useState([]); // custom modules registry
  const [savingKey, setSavingKey] = useState(null);

  // Module visibility is platform-level policy — super admin only (the RLS
  // company-admin policy was dropped in 0049; this guard matches it).
  const targetId = isSuperAdmin ? selectedCompanyId : null;

  const loadModules = useCallback(
    async (cid) => {
      if (!supabase || !cid) return;
      const { data } = await supabase
        .from('company_modules')
        .select('module_key, enabled, variant_id')
        .eq('company_id', cid);
      const states = {};
      const vStates = {};
      MODULES.forEach((m) => { states[m.key] = true; });
      (data || []).forEach((r) => {
        states[r.module_key] = r.enabled;
        vStates[r.module_key] = r.variant_id ?? null;
      });
      setModuleStates(states);
      setVariantStates(vStates);
    },
    [supabase]
  );

  useEffect(() => {
    if (!targetId) return;
    void (async () => {
      await loadModules(targetId);
    })();
  }, [targetId, loadModules]);

  // Custom-module registry — populates the per-module variant dropdowns.
  useEffect(() => {
    if (!supabase || !isSuperAdmin) return;
    void (async () => {
      const { data } = await supabase.from('module_variants').select('id, base_module, name').order('name');
      setAllVariants(data ?? []);
    })();
  }, [supabase, isSuperAdmin]);

  const toggleModule = async (key, val) => {
    if (!supabase || !targetId) return;
    setSavingKey(key);
    setModuleStates((prev) => ({ ...prev, [key]: val }));
    await supabase
      .from('company_modules')
      .upsert(
        { company_id: targetId, module_key: key, enabled: val },
        { onConflict: 'company_id,module_key' }
      );
    setSavingKey(null);
  };

  const setVariant = async (key, variantId) => {
    if (!supabase || !targetId) return;
    setSavingKey(key);
    setVariantStates((prev) => ({ ...prev, [key]: variantId }));
    await supabase
      .from('company_modules')
      .upsert(
        { company_id: targetId, module_key: key, enabled: moduleStates[key] ?? true, variant_id: variantId },
        { onConflict: 'company_id,module_key' }
      );
    setSavingKey(null);
  };

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Puzzle size={16} /> Module Configuration
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Toggle which FSG OS modules are visible for this team.
      </p>

      {isSuperAdmin && companies && companies.length > 0 && (
        <div className="mt-3">
          <Select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
          >
            <option value="">— select a team —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      )}

      {targetId ? (
        <div className="mt-2 divide-y divide-slate-100">
          {MODULES.map((m) => (
            <ModuleToggle
              key={m.key}
              label={m.label}
              description={m.description}
              checked={moduleStates[m.key] ?? true}
              onChange={(val) => toggleModule(m.key, val)}
              saving={savingKey === m.key}
              variants={allVariants.filter((v) => v.base_module === m.key)}
              variantId={variantStates[m.key] ?? null}
              onSetVariant={(vid) => setVariant(m.key, vid)}
            />
          ))}
        </div>
      ) : (
        isSuperAdmin && (
          <p className="mt-4 text-sm text-slate-400">Select a team above to configure its modules.</p>
        )
      )}
    </Card>
  );
}
