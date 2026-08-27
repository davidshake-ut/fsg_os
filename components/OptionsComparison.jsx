'use client';

import { useState } from 'react';
import { Card, Segmented } from '@/components/ui/primitives';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { currency, percent } from '@/lib/format';
import { customerRows, signedText } from '@/lib/optionComparison';
import { cn } from '@/lib/utils';

// Design options side by side (complex-project Builder, Phase 6): one
// column per option, the comparison rows from lib/optionComparison, deltas
// against the first option, and the option labels / customer notes
// editable in place. "Customer view" shows exactly what the options PDF
// prints — no cost, no margin.

const inlineInput =
  'rounded border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white';

function EditableText({ value, onCommit, className, placeholder, multiline = false }) {
  const [draft, setDraft] = useState(value ?? '');
  const commit = () => {
    if ((draft ?? '') !== (value ?? '')) onCommit(draft);
  };
  if (multiline) {
    return (
      <textarea
        rows={2}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={cn(inlineInput, 'w-full resize-y text-xs leading-relaxed text-slate-600', className)}
      />
    );
  }
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={cn(inlineInput, className)}
    />
  );
}

export default function OptionsComparison({
  comparison,
  canViewMargin = true,
  canWrite = false,
  termMonths,
  onTermChange = null,
  recommendation = '',
  onRecommendationChange = null,
  onUpdateOption = null,
}) {
  const [view, setView] = useState(canViewMargin ? 'internal' : 'customer');
  const rows = view === 'customer' || !canViewMargin ? customerRows(comparison) : comparison.rows;
  const cols = comparison.columns;
  const fmt = (row, v) => {
    if (v === null || v === undefined) return '—';
    if (row.kind === 'money') return row.precise ? `$${(Number(v) || 0).toFixed(2)}` : currency(Number(v) || 0);
    if (row.kind === 'percent') return percent(Number(v) || 0, 1);
    if (row.kind === 'number') return String(Number(v) || 0);
    return String(v ?? '—');
  };
  const deltaClass = (row, d) => {
    if (d === 0) return 'text-slate-400';
    if (!row.higherIsBetter) return 'text-slate-500';
    return d > 0 ? 'text-emerald-600' : 'text-red-600';
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">
          Options Comparison
          <span className="ml-2 text-xs font-normal text-slate-400">deltas vs {cols[0]?.label ?? 'the first option'}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {onTermChange && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Term
              <input
                type="number"
                min="1"
                value={termMonths}
                onChange={(e) => onTermChange(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-16 rounded border border-slate-200 px-1.5 text-right text-xs tabular-nums outline-none focus:border-blue-400"
              />
              months
            </label>
          )}
          {canViewMargin && (
            <div className="w-56">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'internal', label: 'Internal' },
                  { value: 'customer', label: 'Customer view' },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2 font-medium">Option</th>
              {cols.map((c) => (
                <th key={c.id} className="px-4 py-2 text-right font-medium">
                  <div className="flex flex-col items-end gap-1">
                    {canWrite && onUpdateOption ? (
                      <EditableText
                        value={c.label}
                        placeholder="Option name"
                        className="w-40 text-right font-semibold text-slate-700"
                        onCommit={(v) => onUpdateOption(c.id, { optionLabel: v })}
                      />
                    ) : (
                      <span className="font-semibold text-slate-700">{c.label}</span>
                    )}
                    <QuoteStatusBadge status={c.status} version={c.version} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={cn('border-b border-slate-50', row.total && 'border-t border-slate-200 font-semibold')}>
                <td className="px-4 py-2 text-slate-700">{row.label}</td>
                {row.values.map((v, i) => {
                  const d = row.deltas[i];
                  return (
                    <td key={cols[i].id} className="px-4 py-2 text-right tabular-nums text-slate-700">
                      <div>{fmt(row, v)}</div>
                      {d !== null && d !== undefined && (
                        <div className={cn('text-xs font-normal tabular-nums', deltaClass(row, d))}>
                          {signedText(d, (x) => fmt(row, x))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="align-top">
              <td className="px-4 py-2 text-slate-700">Notes</td>
              {cols.map((c) => (
                <td key={c.id} className="px-4 py-2 text-right">
                  {canWrite && onUpdateOption ? (
                    <EditableText
                      multiline
                      value={c.notes}
                      placeholder="What this option is for…"
                      onCommit={(v) => onUpdateOption(c.id, { optionNotes: v })}
                    />
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-500">{c.notes || '—'}</p>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {onRecommendationChange && (
        <div className="border-t border-slate-100 px-4 py-3">
          <label className="text-xs font-medium text-slate-600">Recommendation (printed on the customer PDF)</label>
          <textarea
            rows={2}
            value={recommendation}
            onChange={(e) => onRecommendationChange(e.target.value)}
            placeholder="e.g. Option B carries the property for ten years at $2 more per unit per month."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      )}
    </Card>
  );
}
