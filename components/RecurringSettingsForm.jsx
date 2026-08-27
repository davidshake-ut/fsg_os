'use client';

import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Button, Field, NumberInput, Toggle } from '@/components/ui/primitives';
import { DEFAULT_CARRIER_CIRCUITS, normalizeCarrierCircuits } from '@/lib/recurring';
import { DEFAULT_FINANCING, normalizeFinancing, normalizeTerms } from '@/lib/financing';

// Settings → Pricing: the carrier circuit rate card (bandwidth × term →
// monthly charge) proposals pick circuits from, and the financing defaults
// every new proposal starts with (APR, terms, lender discount). Stored at
// companies.settings.carrierCircuits and companies.settings.financing; a
// proposal can override financing on its Overview.

// Remounts the editor whenever the stored values change (a save, a team
// switch) so its state re-initializes without an effect.
export default function RecurringSettingsForm() {
  const { company } = useSession();
  if (!company) return null;
  const stamp = JSON.stringify([company.settings?.carrierCircuits ?? null, company.settings?.financing ?? null]);
  return <RecurringSettingsEditor key={`${company.id}:${stamp}`} />;
}

const cell = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400';

function RecurringSettingsEditor() {
  const supabase = getSupabase();
  const { company, refresh: refreshSession } = useSession();

  const [circuits, setCircuits] = useState(() =>
    normalizeCarrierCircuits(company?.settings?.carrierCircuits).map((c, i) => ({ ...c, id: c.id ?? `cc-${i}` }))
  );
  const [financing, setFinancing] = useState(() => normalizeFinancing(company?.settings?.financing));
  const [termsText, setTermsText] = useState(() => normalizeFinancing(company?.settings?.financing).terms.join(', '));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const updateCircuit = (id, patch) => setCircuits((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCircuit = (id) => setCircuits((list) => list.filter((c) => c.id !== id));
  const addCircuit = () =>
    setCircuits((list) => [...list, { id: `cc-${Date.now().toString(36)}`, carrier: '', bandwidth: '', termMonths: 36, mrc: 0 }]);

  const save = async () => {
    if (!supabase || !company) return;
    setSaving(true);
    setErr(null);
    try {
      const terms = normalizeTerms(termsText.split(/[,\s]+/).filter(Boolean)) ?? [];
      const settings = {
        ...(company.settings ?? {}),
        carrierCircuits: normalizeCarrierCircuits(circuits),
        financing: normalizeFinancing({ ...financing, terms: terms.length ? terms : DEFAULT_FINANCING.terms }),
      };
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

  return (
    <div className="space-y-4 border-t border-slate-100 pt-6">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Recurring &amp; Financing</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          The carrier circuits a proposal can add with one click (monthly charge by bandwidth and term), and the
          financing defaults every new proposal starts with. Circuits are added at the carrier&apos;s retail charge;
          each proposal sets its own client price.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
              <th className="px-3 py-2 font-medium">Carrier</th>
              <th className="px-3 py-2 font-medium">Bandwidth</th>
              <th className="px-3 py-2 text-right font-medium">Term (months)</th>
              <th className="px-3 py-2 text-right font-medium">Monthly charge</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {circuits.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-1.5">
                  <input aria-label="Carrier" value={c.carrier} placeholder="Carrier" onChange={(e) => updateCircuit(c.id, { carrier: e.target.value })} className={cell} />
                </td>
                <td className="px-3 py-1.5">
                  <input aria-label="Bandwidth" value={c.bandwidth} placeholder="5 Gb" onChange={(e) => updateCircuit(c.id, { bandwidth: e.target.value })} className={cell} />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min="1"
                    aria-label="Term months"
                    value={c.termMonths}
                    onChange={(e) => updateCircuit(c.id, { termMonths: Number(e.target.value) })}
                    className={`${cell} text-right tabular-nums`}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Monthly charge"
                    value={c.mrc}
                    onChange={(e) => updateCircuit(c.id, { mrc: Number(e.target.value) })}
                    className={`${cell} text-right tabular-nums`}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button type="button" aria-label="Remove circuit" onClick={() => removeCircuit(c.id)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {circuits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-400">No circuits on the rate card.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addCircuit}>
          <Plus size={13} /> Add circuit
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCircuits(DEFAULT_CARRIER_CIRCUITS.map((c) => ({ ...c })))}>
          <RotateCcw size={13} /> Default card
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-800">Financing defaults</h4>
          <Toggle checked={financing.enabled} onChange={(v) => setFinancing((f) => ({ ...f, enabled: v }))} label="Offer financing on new proposals" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="APR %" sub="Annual rate behind the level payment">
            <NumberInput value={financing.apr} step="0.25" onChange={(v) => setFinancing((f) => ({ ...f, apr: v }))} />
          </Field>
          <Field label="Lender discount %" sub="Uplifts the financed price so the sale nets the cash price">
            <NumberInput value={financing.lenderDiscountPct} step="0.5" onChange={(v) => setFinancing((f) => ({ ...f, lenderDiscountPct: v }))} />
          </Field>
          <Field label="Terms (months)" sub="Comma-separated, e.g. 36, 60">
            <input aria-label="Terms" value={termsText} onChange={(e) => setTermsText(e.target.value)} className={cell} />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save recurring & financing'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
