'use client';

import { Cable, RotateCcw } from 'lucide-react';
import { Card, Toggle } from '@/components/ui/primitives';
import { CABLING_RUN_TYPES } from '@/lib/cablingRuns';
import { deriveCablingRuns } from '@/lib/cablingTakeoff';
import { productsBySku } from '@/lib/assemblies';
import { currency } from '@/lib/format';
import { cn } from '@/lib/utils';

// The structured-cabling run table on the Digital Infrastructure surface:
// one row per run type with its derived count (from the property), an
// optional entered count, the Cabling SKU it prices at, and extended cost /
// price. Derived counts recompute as the property changes; an entered count
// sticks until reset.

const cellInput =
  'w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-sm tabular-nums text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400';
const inlineSelect =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-600 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white';

export default function CablingCard({ model, onChange, products = [], inputs = null, canViewMargin = true }) {
  const cabling = model.cabling;
  const runs = deriveCablingRuns(model, { inputs });
  const bySku = productsBySku(products);
  const skuOptions = products.filter((p) => p.category === 'Cabling');

  const setRun = (key, patch) => {
    const prev = cabling.runs[key] ?? {};
    const next = { ...prev, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    onChange({ cabling: { ...cabling, runs: { ...cabling.runs, [key]: next } } });
  };

  const rows = CABLING_RUN_TYPES.map((type) => {
    const run = runs[type.key];
    const p = bySku.get(run.sku);
    const cost = Number(p?.cost) || 0;
    const price = Number(p?.price) || 0;
    const active = cabling.enabled && run.enabled && run.qty > 0;
    return { type, run, p, cost, price, extCost: active ? run.qty * cost : 0, extPrice: active ? run.qty * price : 0, active };
  });
  const totals = rows.reduce((t, r) => ({ cost: t.cost + r.extCost, price: t.price + r.extPrice, runs: t.runs + (r.active ? r.run.qty : 0) }), { cost: 0, price: 0, runs: 0 });

  return (
    <Card className={cn('overflow-hidden', !cabling.enabled && 'opacity-70')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Cable size={14} className="text-slate-400" /> Structured Cabling
          {cabling.enabled && (
            <span className="text-xs font-normal text-slate-400">
              {totals.runs} runs · {currency(totals.price)}
              {canViewMargin ? ` (cost ${currency(totals.cost)})` : ''}
            </span>
          )}
        </h3>
        <div className="w-56">
          <Toggle checked={cabling.enabled} onChange={(v) => onChange({ cabling: { ...cabling, enabled: v } })} label="Quote cabling" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">Run</th>
              <th className="px-2 py-2 text-right font-medium" title="From the property model">Derived</th>
              <th className="px-2 py-2 text-right font-medium" title="Type a count to use it instead of the derived one">Qty</th>
              <th className="px-3 py-2 font-medium">Priced as</th>
              {canViewMargin && <th className="px-2 py-2 text-right font-medium">Cost / run</th>}
              <th className="px-2 py-2 text-right font-medium">Price / run</th>
              {canViewMargin && <th className="px-2 py-2 text-right font-medium">Ext. cost</th>}
              <th className="px-2 py-2 text-right font-medium">Ext. price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ type, run, p, cost, price, extCost, extPrice }) => (
              <tr key={type.key} className={cn('border-b border-slate-50 last:border-0', !run.enabled && 'text-slate-400')}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={run.enabled}
                    onChange={(e) => setRun(type.key, { enabled: e.target.checked ? undefined : false })}
                    title="Include this run type"
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className={cn('font-medium', run.enabled ? 'text-slate-700' : 'text-slate-400')}>{type.label}</div>
                  <div className="text-[11px] text-slate-400">{type.hint}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{run.derived}</td>
                <td className="px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min="0"
                      className={cn(cellInput, run.entered && 'border-amber-300 bg-amber-50')}
                      value={run.entered ? run.qty : ''}
                      placeholder={String(run.derived)}
                      onChange={(e) => setRun(type.key, { qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                    />
                    {run.entered && (
                      <button type="button" onClick={() => setRun(type.key, { qty: undefined })} title="Back to the derived count" className="rounded p-0.5 text-amber-600 hover:bg-amber-100">
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <select className={cn(inlineSelect, !p && 'text-red-600')} value={run.sku} onChange={(e) => setRun(type.key, { sku: e.target.value || undefined })}>
                    {!p && <option value={run.sku}>{run.sku} (not in catalog)</option>}
                    {skuOptions.map((o) => (
                      <option key={o.sku} value={o.sku}>
                        {o.sku} — {o.desc}
                      </option>
                    ))}
                  </select>
                </td>
                {canViewMargin && <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{currency(cost)}</td>}
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{currency(price)}</td>
                {canViewMargin && <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{currency(extCost)}</td>}
                <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-700">{currency(extPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <td className="px-3 py-1.5" colSpan={3}>Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.runs}</td>
              <td />
              {canViewMargin && <td />}
              <td />
              {canViewMargin && <td className="px-2 py-1.5 text-right tabular-nums">{currency(totals.cost)}</td>}
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{currency(totals.price)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] leading-relaxed text-slate-400">
        Runs quote as this technology&apos;s services (install work, no shipping). Per-run rates are Cabling products in the Product Database.
      </p>
    </Card>
  );
}
