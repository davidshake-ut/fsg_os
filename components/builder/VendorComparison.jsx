'use client';

import { Card, Badge } from '@/components/ui/primitives';
import { currency, percent } from '@/lib/format';
import { comparisonRows, signed } from '@/lib/vendorComparison';
import { cn } from '@/lib/utils';

// Option A vs Option B table for one technology quoted with two or more
// vendors — the on-screen twin of the comparison blocks in exportPDF /
// exportProposal / exportCSV. `group` comes from lib/vendorComparison's
// optionGroups(); canViewMargin adds the cost / profit / margin rows.
export default function VendorComparison({ group, canViewMargin = true }) {
  const rows = comparisonRows(group, { includeMargin: canViewMargin });
  const fmt = (kind, v) => (kind === 'percent' ? percent(v, 1) : currency(v));
  const deltaClass = (row, d) => {
    if (d === 0) return 'text-slate-400';
    if (!row.higherIsBetter) return 'text-slate-500';
    return d > 0 ? 'text-emerald-600' : 'text-red-600';
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Option Comparison — {group.label}</h3>
        <p className="text-xs text-slate-500">
          Option A is the quoted total. Alternates price the same system with another vendor and are not added to it.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2 font-medium">Category</th>
              {group.options.map((o) => (
                <th key={o.section.vendorId ?? o.letter} className="px-4 py-2 text-right font-medium">
                  <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <span className="text-slate-600">Option {o.letter}</span>
                    <span className="font-normal">· {o.vendorName}</span>
                    {o.isPrimary ? (
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">Quoted</Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-50 text-amber-700">Alternate</Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isTotal = row.label === 'Total';
              return (
                <tr
                  key={row.label}
                  className={cn('border-b border-slate-50', isTotal && 'border-t border-slate-200 font-semibold')}
                >
                  <td className="px-4 py-2.5 text-slate-700">{row.label}</td>
                  {row.values.map((v, i) => {
                    const d = row.deltas[i];
                    return (
                      <td
                        key={group.options[i].section.vendorId ?? group.options[i].letter}
                        className="px-4 py-2.5 text-right tabular-nums text-slate-700"
                      >
                        <div>{fmt(row.kind, v)}</div>
                        {d !== null && (
                          <div className={cn('text-xs font-normal tabular-nums', deltaClass(row, d))}>
                            {signed(d, (x) => fmt(row.kind, x))} vs A
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
