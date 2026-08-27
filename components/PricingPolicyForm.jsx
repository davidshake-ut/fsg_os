'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Button, Segmented } from '@/components/ui/primitives';
import { PRODUCT_CATEGORIES } from '@/lib/catalog';
import { DEFAULT_MARKUP_BY_CATEGORY, normalizePricingPolicy } from '@/lib/pricingPolicy';

// Settings → Pricing: how quotes turn cost into sell price. "List prices"
// uses each product's own price; "Cost-plus" multiplies cost by a markup
// per subcategory (the takeoff-sheet way). A blank markup keeps that
// subcategory on list price (cabling runs and services carry their own).
// Stored at companies.settings.pricingPolicy; a proposal can pick its own
// mode on the Builder's Overview.

// Remounts the editor whenever the stored policy changes (a save, a team
// switch) so its state re-initializes without an effect.
export default function PricingPolicyForm() {
  const { company } = useSession();
  if (!company) return null;
  return <PricingPolicyEditor key={`${company.id}:${JSON.stringify(company.settings?.pricingPolicy ?? null)}`} />;
}

function PricingPolicyEditor() {
  const supabase = getSupabase();
  const { company, refresh: refreshSession } = useSession();

  const [policy, setPolicy] = useState(() => normalizePricingPolicy(company?.settings?.pricingPolicy));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const categories = [...new Set([...PRODUCT_CATEGORIES, ...Object.keys(policy.markupByCategory)])];
  const setMarkup = (cat, raw) =>
    setPolicy((p) => ({ ...p, markupByCategory: { ...p.markupByCategory, [cat]: raw === '' ? null : Number(raw) } }));

  const save = async () => {
    if (!supabase || !company) return;
    setSaving(true);
    setErr(null);
    try {
      const settings = { ...(company.settings ?? {}), pricingPolicy: normalizePricingPolicy(policy) };
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
        <h3 className="text-sm font-semibold text-slate-800">Pricing Policy</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          How quotes turn cost into sell price. Cost-plus prices every line at cost × (1 + markup) by subcategory — the
          way a takeoff sheet does — and linked licenses sell at their device&apos;s markup. Each proposal can switch mode
          on its Overview; locked quotes keep their frozen prices.
        </p>
      </div>

      <div className="max-w-xs">
        <Segmented
          value={policy.mode}
          onChange={(v) => setPolicy((p) => ({ ...p, mode: v }))}
          options={[
            { value: 'catalog', label: 'List prices' },
            { value: 'costPlus', label: 'Cost-plus' },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
              <th className="px-3 py-2 font-medium">Subcategory</th>
              <th className="px-3 py-2 text-right font-medium">Markup % on cost</th>
              <th className="px-3 py-2 font-medium">Blank = list price</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const v = policy.markupByCategory[cat];
              const isDefault = (DEFAULT_MARKUP_BY_CATEGORY[cat] ?? null) === (v ?? null);
              return (
                <tr key={cat} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5 text-slate-700">{cat}</td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={v ?? ''}
                      placeholder="list"
                      onChange={(e) => setMarkup(cat, e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none placeholder:text-slate-300 focus:border-blue-400"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">
                    {v === null || v === undefined ? 'keeps list price' : `cost × ${(1 + v / 100).toFixed(2)}`}
                    {!isDefault && <span className="ml-2 text-amber-600">edited</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save pricing policy'}
        </Button>
        <Button variant="outline" onClick={() => setPolicy((p) => ({ ...p, markupByCategory: { ...DEFAULT_MARKUP_BY_CATEGORY } }))}>
          <RotateCcw size={13} /> Default markups
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
    </div>
  );
}
