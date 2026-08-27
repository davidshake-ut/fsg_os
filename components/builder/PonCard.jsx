'use client';

import { Network, RotateCcw } from 'lucide-react';
import { Card, Field, NumberInput, Segmented, Toggle } from '@/components/ui/primitives';
import { currency } from '@/lib/format';
import { normalizePropertyModel } from '@/lib/propertyModel';
import { PON_ROLES } from '@/lib/ponModel';
import { derivePon, computePonLines, ponTotals, ponLaborHours } from '@/lib/ponTakeoff';
import { cn } from '@/lib/utils';

// XGS-PON design card on the Digital Infrastructure surface (complex-
// project Builder, Phase 8): the sizing rules, the derived counts, and one
// priced line per PON role with its catalog SKU. Splitters ride in the
// FTTU IDF kits; the count here is what the OLT ports and activation
// hours are sized from.

const select = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400';

export default function PonCard({ model: value, onChange, products = [], inputs = null, canViewMargin = true }) {
  const model = normalizePropertyModel(value);
  const pon = model.pon;
  const d = derivePon(model, { inputs });
  const lines = computePonLines(model, products, { inputs });
  const totals = ponTotals(lines);
  const hours = ponLaborHours(model, { inputs })['install-tech'];
  const setPon = (patch) => onChange({ pon: { ...pon, ...patch } });
  const setSku = (key, sku) => setPon({ skus: { ...pon.skus, [key]: sku } });
  const setHours = (key, v) => setPon({ hours: { ...pon.hours, [key]: v } });

  const optionsFor = (role) => {
    const current = pon.skus[role.key];
    const list = products.filter((p) => p.category === role.category || p.sku === current);
    if (current && !list.some((p) => p.sku === current)) list.push({ sku: current, desc: `${current} (not in catalog)` });
    return list;
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Network size={15} className="text-violet-500" /> XGS-PON design
          <span className="text-xs font-normal text-slate-400">— fiber to every unit, ONT at the AP</span>
        </h3>
        <span className="text-xs tabular-nums text-slate-500">
          {canViewMargin && <>{currency(totals.cost)} cost · </>}
          {currency(totals.price)} price · {hours} h
        </span>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="ONT per">
          <Segmented
            value={pon.ontPer}
            onChange={(v) => setPon({ ontPer: v })}
            options={[
              { value: 'ap', label: 'In-unit AP' },
              { value: 'unit', label: 'Unit' },
            ]}
          />
        </Field>
        <Field label="Split ratio" sub={`1:${pon.splitRatio} PLC splitters`}>
          <NumberInput value={pon.splitRatio} min={1} onChange={(v) => setPon({ splitRatio: v })} />
        </Field>
        <Field label="OLT PON ports" sub="per OLT chassis">
          <NumberInput value={pon.oltPorts} min={1} onChange={(v) => setPon({ oltPorts: v })} />
        </Field>
        <Field label="Townhome ONUs" sub={d.onuDerived ? `derived: ${d.onus} townhome room${d.onus === 1 ? '' : 's'}` : 'entered'}>
          <div className="flex items-center gap-1">
            <NumberInput value={d.onus} min={0} onChange={(v) => setPon({ onuCount: v })} />
            {!d.onuDerived && (
              <button type="button" title="Back to the derived count" onClick={() => setPon({ onuCount: null })} className="rounded p-1 text-slate-400 hover:text-slate-600">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </Field>
        <Field label="ONT provisioning" sub="hours per ONT">
          <NumberInput value={pon.hours.ontProvisioning} min={0} step="0.25" onChange={(v) => setHours('ontProvisioning', v)} />
        </Field>
        <Field label="PON activation" sub="hours per splitter">
          <NumberInput value={pon.hours.ponActivation} min={0} step="0.25" onChange={(v) => setHours('ponActivation', v)} />
        </Field>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-3 lg:col-span-6">
          <Toggle checked={pon.oltRedundantPsu} onChange={(v) => setPon({ oltRedundantPsu: v })} label="Redundant OLT power supplies" />
          <Toggle checked={pon.injectorPerOnt} onChange={(v) => setPon({ injectorPerOnt: v })} label="PoE injector per ONT-fed AP" />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-xs text-slate-500">
        <span><b className="tabular-nums text-slate-700">{d.unitAPs}</b> in-unit APs</span>
        <span><b className="tabular-nums text-slate-700">{d.onts}</b> ONTs</span>
        <span><b className="tabular-nums text-slate-700">{d.splitters}</b> × 1:{d.splitRatio} splitters (in the FTTU IDF kits)</span>
        <span><b className="tabular-nums text-slate-700">{d.olts}</b> OLT{d.olts === 1 ? '' : 's'} · {d.ponPortsUsed}/{d.ponPortsAvailable} PON ports</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-t border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium">SKU</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              {canViewMargin && <th className="px-2 py-2 text-right font-medium">Unit cost</th>}
              <th className="px-2 py-2 text-right font-medium">Unit price</th>
              <th className="px-4 py-2 text-right font-medium">Extended</th>
            </tr>
          </thead>
          <tbody>
            {PON_ROLES.map((role) => {
              const line = lines.find((l) => l.role === role.key);
              const qty = Math.round(Number(d[role.countKey]) || 0);
              return (
                <tr key={role.key} className={cn('border-b border-slate-50', qty === 0 && 'text-slate-400')}>
                  <td className="px-4 py-1.5">
                    <div className="text-slate-700">{role.label}</div>
                    <div className="text-[11px] text-slate-400">{role.hint}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`${role.label} SKU`} className={select} value={pon.skus[role.key]} onChange={(e) => setSku(role.key, e.target.value)}>
                      {optionsFor(role).map((p) => (
                        <option key={p.sku} value={p.sku}>{p.sku} — {p.desc}</option>
                      ))}
                    </select>
                    {line?.missing && <div className="text-[11px] text-red-600">Not in this catalog</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{qty}</td>
                  {canViewMargin && <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{line ? currency(line.cost) : '—'}</td>}
                  <td className="px-2 py-1.5 text-right tabular-nums">{line ? currency(line.price) : '—'}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums font-medium">{line ? currency(line.qty * line.price) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td className="px-4 py-2 text-slate-800" colSpan={canViewMargin ? 3 : 2}>PON hardware</td>
              {canViewMargin && <td className="px-2 py-2 text-right tabular-nums text-slate-500">{currency(totals.cost)}</td>}
              <td />
              <td className="px-4 py-2 text-right tabular-nums text-blue-700">{currency(totals.price)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-slate-400">
        Under XGS-PON the IDF closets carry no PoE switches: unit APs are powered by their injectors, and only the amenity and outdoor APs still ride a switch at the MDF. The Cat6-to-unit cabling run derives to zero; enter a count to keep copper too.
      </p>
    </Card>
  );
}
