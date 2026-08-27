'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Button } from '@/components/ui/primitives';
import { DEFAULT_LABOR_ROLES } from '@/lib/defaults';
import { DEFAULT_LABOR_TASKS, LABOR_DRIVERS, LABOR_GATES, LABOR_TASK_PRESETS, normalizeLaborTasks } from '@/lib/laborTasks';

// Settings → Labor: the task table behind every proposal's labor estimate.
// Each task credits `hours` per unit of a design driver (APs, switches by
// class, telecom rooms, cameras…) or a flat block to a rate-card role,
// gated on which systems the quote has. Stored at
// companies.settings.laborTasks; the rate card on each proposal still
// overrides any role's hours by hand.

const cell = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400';
const GATE_LABELS = { any: 'Any system', wifi: 'Wi-Fi present', camera: 'Cameras present', ai: 'AI licenses' };

// Remounts the editor whenever the stored table changes (a save, a team
// switch) so its state re-initializes without an effect.
export default function LaborTasksForm() {
  const { company } = useSession();
  if (!company) return <p className="text-sm text-slate-400">Join a team to manage labor tasks.</p>;
  return <LaborTasksEditor key={`${company.id}:${JSON.stringify(company.settings?.laborTasks ?? null)}`} />;
}

function LaborTasksEditor() {
  const supabase = getSupabase();
  const { company, refresh: refreshSession } = useSession();

  const [rows, setRows] = useState(() =>
    (normalizeLaborTasks(company?.settings?.laborTasks) ?? DEFAULT_LABOR_TASKS).map((t, i) => ({ ...t, id: `${t.key}-${i}` }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () =>
    setRows((rs) => [...rs, { id: `new-${Date.now()}`, key: `task_${rs.length + 1}`, label: '', role: DEFAULT_LABOR_ROLES[0].key, hours: 1, driver: 'aps', when: 'any', qty: 1 }]);
  const loadPreset = (name) => setRows(LABOR_TASK_PRESETS[name].tasks.map((t, i) => ({ ...t, id: `${t.key}-${i}-${Date.now()}` })));

  const save = async () => {
    if (!supabase || !company) return;
    setSaving(true);
    setErr(null);
    try {
      const laborTasks = normalizeLaborTasks(rows.map(({ id: _id, ...t }) => t));
      const settings = { ...(company.settings ?? {}), laborTasks };
      const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
      if (error) throw error;
      await refreshSession?.().catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const byRole = DEFAULT_LABOR_ROLES.map((r) => r.key);

  return (
    <div className="space-y-4">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Labor Tasks</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          The hours behind every proposal&apos;s rate card: each task credits hours per unit of a design driver (or a
          flat block) to a role, when that kind of system is on the quote. Digital Infrastructure kits and other
          calculators add their own hours on top. Any role&apos;s hours can still be overridden on the proposal.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Start from:</span>
        {Object.entries(LABOR_TASK_PRESETS).map(([name, preset]) => (
          <Button key={name} variant="outline" size="sm" onClick={() => loadPreset(name)}>
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
              <th className="px-3 py-2 font-medium">Per</th>
              <th className="px-3 py-2 text-right font-medium">Qty (flat)</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-1.5">
                  <input value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} placeholder="e.g. AP install" className={cell} />
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.role} onChange={(e) => setRow(r.id, { role: e.target.value })} className={cell}>
                    {[...new Set([...byRole, r.role])].map((key) => (
                      <option key={key} value={key}>{DEFAULT_LABOR_ROLES.find((x) => x.key === key)?.label ?? key}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" min="0" step="0.05" value={r.hours} onChange={(e) => setRow(r.id, { hours: e.target.value })} className={`${cell} text-right tabular-nums`} />
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.driver} onChange={(e) => setRow(r.id, { driver: e.target.value })} className={cell}>
                    {Object.entries(LABOR_DRIVERS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={r.driver === 'flat' ? r.qty ?? 1 : ''}
                    disabled={r.driver !== 'flat'}
                    onChange={(e) => setRow(r.id, { qty: e.target.value })}
                    className={`${cell} text-right tabular-nums disabled:bg-slate-50 disabled:text-slate-300`}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select value={r.when} onChange={(e) => setRow(r.id, { when: e.target.value })} className={cell}>
                    {LABOR_GATES.map((g) => (
                      <option key={g} value={g}>{GATE_LABELS[g]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button type="button" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.label || 'task'}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus size={13} /> Task
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save labor tasks'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
