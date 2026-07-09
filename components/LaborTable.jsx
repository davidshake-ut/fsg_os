'use client';

import { RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { currency, percent, marginColor } from '@/lib/format';

// Editable professional-labor rate card. Each row is a worker level with an
// internal cost rate, a client bill rate, and hours. Hours are auto-estimated
// from the live Wi-Fi + camera design (see lib/estimateLaborHours.js); editing a
// row overrides its estimate, and the reset arrow returns it to the estimate.
// This is the project's ONLY labor. Cost/margin columns appear with "Show Cost &
// Margin" (mirrors the BOM/Services tables).
export default function LaborTable({ roles, setRoles, showMargin: showMarginProp, canViewMargin = true, estimatedHours = {} }) {
  // canViewMargin gates cost/margin regardless of the shared showMargin toggle's state.
  const showMargin = showMarginProp && canViewMargin;
  const setField = (key, field, value) =>
    setRoles((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const num = (v) => Math.max(0, Number(v) || 0);

  const rows = roles.map((r) => {
    const isAuto = r.hours == null;
    const hours = isAuto ? num(estimatedHours[r.key]) : num(r.hours);
    const costRate = num(r.costRate);
    const billRate = num(r.billRate);
    const lineCost = costRate * hours;
    const linePrice = billRate * hours;
    return {
      ...r,
      isAuto,
      hours,
      lineCost,
      linePrice,
      margin: linePrice > 0 ? ((linePrice - lineCost) / linePrice) * 100 : 0,
    };
  });

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalCost = rows.reduce((s, r) => s + r.lineCost, 0);
  const totalPrice = rows.reduce((s, r) => s + r.linePrice, 0);
  const anyOverride = rows.some((r) => !r.isAuto);

  const cell =
    'h-7 w-20 rounded border border-slate-300 px-2 text-right text-xs tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Professional Labor</h3>
          <p className="text-xs text-slate-400">
            Hours are estimated from your Wi-Fi &amp; camera design — edit any value to override,
            or reset it to the estimate.
          </p>
        </div>
        {anyOverride && (
          <button
            onClick={() => setRoles((prev) => prev.map((r) => ({ ...r, hours: null })))}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Reset all to estimate
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2 font-medium">Worker Level</th>
              {showMargin && <th className="px-4 py-2 text-right font-medium">Cost/hr</th>}
              <th className="px-4 py-2 text-right font-medium">Bill/hr</th>
              <th className="px-4 py-2 text-right font-medium">Hours</th>
              {showMargin && <th className="px-4 py-2 text-right font-medium">Cost</th>}
              <th className="px-4 py-2 text-right font-medium">Price</th>
              {showMargin && <th className="px-4 py-2 text-right font-medium">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 text-slate-700">{r.label}</td>
                {showMargin && (
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={cell}
                      value={r.costRate}
                      onChange={(e) => setField(r.key, 'costRate', Number(e.target.value))}
                    />
                  </td>
                )}
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={cell}
                    value={r.billRate}
                    onChange={(e) => setField(r.key, 'billRate', Number(e.target.value))}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      title={r.isAuto ? 'Estimated from the design — edit to override' : 'Overridden'}
                      className={`${cell} ${r.isAuto ? 'text-slate-400' : 'border-orange-300 bg-orange-50/40'}`}
                      value={r.hours}
                      onChange={(e) => setField(r.key, 'hours', Number(e.target.value))}
                    />
                    <button
                      title="Reset to estimate"
                      onClick={() => setField(r.key, 'hours', null)}
                      className={`text-slate-400 hover:text-slate-700 ${r.isAuto ? 'invisible' : ''}`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </td>
                {showMargin && (
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {currency(r.lineCost)}
                  </td>
                )}
                <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-700">
                  {currency(r.linePrice)}
                </td>
                {showMargin && (
                  <td className="px-4 py-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${marginColor(r.margin)}`}>
                      {percent(r.margin, 0)}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td className="px-4 py-2.5 text-slate-700">
                Labor Subtotal
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({totalHours} hr{totalHours === 1 ? '' : 's'})
                </span>
              </td>
              {showMargin && <td />}
              <td />
              <td />
              {showMargin && (
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                  {currency(totalCost)}
                </td>
              )}
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                {currency(totalPrice)}
              </td>
              {showMargin && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
