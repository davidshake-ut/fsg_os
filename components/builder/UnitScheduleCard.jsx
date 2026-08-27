'use client';

import { Plus, Trash2, Upload, LayoutGrid } from 'lucide-react';
import { Card, Button } from '@/components/ui/primitives';
import { orderedLevels, unitTypeTotal, newId } from '@/lib/propertyModel';
import { cn } from '@/lib/utils';

// The unit schedule: one row per unit type, one column per level (grouped
// by building), counts in the cells, totals on the edges. Mirrors the
// architect's unit-mix table so what David pastes is what he sees.

const cellInput =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm tabular-nums text-slate-700 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white';
const textInput =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-700 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white';

export default function UnitScheduleCard({ model, totals, onChange, onImport }) {
  const levels = orderedLevels(model);
  const buildingName = Object.fromEntries(model.buildings.map((b) => [b.id, b.name]));
  const groups = model.buildings
    .map((b) => ({ id: b.id, name: b.name, span: levels.filter((l) => l.buildingId === b.id).length }))
    .filter((g) => g.span > 0);

  const updateType = (id, patch) =>
    onChange({ unitTypes: model.unitTypes.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
  const setCount = (id, levelId, value) =>
    onChange({
      unitTypes: model.unitTypes.map((u) => {
        if (u.id !== id) return u;
        const counts = { ...u.counts };
        const n = Math.max(0, Number(value) || 0);
        if (n > 0) counts[levelId] = n;
        else delete counts[levelId];
        return { ...u, counts };
      }),
    });
  const removeType = (id) => onChange({ unitTypes: model.unitTypes.filter((u) => u.id !== id) });
  const addType = () =>
    onChange({
      unitTypes: [
        ...model.unitTypes,
        { id: newId('ut'), code: '', description: '', bedrooms: 1, kind: 'apartment', sqft: 0, counts: {} },
      ],
    });

  const empty = model.unitTypes.length === 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <LayoutGrid size={14} className="text-slate-400" /> Unit Schedule
          {!empty && (
            <span className="text-xs font-normal text-slate-400">
              {totals.unitTypes} unit type{totals.unitTypes === 1 ? '' : 's'} · {totals.units} units · {totals.beds} beds
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onImport}>
            <Upload size={13} /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={addType} disabled={levels.length === 0}>
            <Plus size={13} /> Unit type
          </Button>
        </div>
      </div>

      {levels.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          Add buildings and levels above (or import the unit schedule) before entering unit counts.
        </p>
      ) : empty ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No unit types yet — import the architect&apos;s unit mix, or add unit types by hand.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-left font-medium" rowSpan={2}>Unit type</th>
                <th className="px-2 py-1.5 text-left font-medium" rowSpan={2}>Description</th>
                <th className="px-2 py-1.5 text-right font-medium" rowSpan={2}>Beds</th>
                <th className="px-2 py-1.5 text-left font-medium" rowSpan={2}>Kind</th>
                <th className="px-2 py-1.5 text-right font-medium" rowSpan={2}>Sq ft</th>
                {groups.map((g) => (
                  <th key={g.id} colSpan={g.span} className="border-l border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-500">
                    {g.name}
                  </th>
                ))}
                <th className="border-l border-slate-200 px-2 py-1.5 text-right font-medium" rowSpan={2}>Total</th>
                <th rowSpan={2} />
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-400">
                {levels.map((l, i) => (
                  <th
                    key={l.id}
                    title={`${buildingName[l.buildingId]} · ${l.name}`}
                    className={cn('min-w-[3.25rem] px-1 py-1 text-center font-medium', (i === 0 || levels[i - 1].buildingId !== l.buildingId) && 'border-l border-slate-200')}
                  >
                    {l.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.unitTypes.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1">
                    <input className={cn(textInput, 'w-24 font-mono text-xs')} value={u.code} placeholder="Code" onChange={(e) => updateType(u.id, { code: e.target.value })} />
                  </td>
                  <td className="px-2 py-1">
                    <input className={cn(textInput, 'w-40')} value={u.description} placeholder="Description" onChange={(e) => updateType(u.id, { description: e.target.value })} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" className={cn(cellInput, 'w-14')} value={u.bedrooms} onChange={(e) => updateType(u.id, { bedrooms: Math.max(0, Number(e.target.value) || 0) })} />
                  </td>
                  <td className="px-2 py-1">
                    <select className={cn(textInput, 'w-28')} value={u.kind} onChange={(e) => updateType(u.id, { kind: e.target.value })}>
                      <option value="apartment">Apartment</option>
                      <option value="townhome">Townhome</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min="0" className={cn(cellInput, 'w-20')} value={u.sqft} onChange={(e) => updateType(u.id, { sqft: Math.max(0, Number(e.target.value) || 0) })} />
                  </td>
                  {levels.map((l, i) => (
                    <td key={l.id} className={cn('px-1 py-1', (i === 0 || levels[i - 1].buildingId !== l.buildingId) && 'border-l border-slate-100')}>
                      <input
                        type="number"
                        min="0"
                        className={cn(cellInput, !(u.counts[l.id] > 0) && 'text-slate-300')}
                        value={u.counts[l.id] ?? 0}
                        onChange={(e) => setCount(u.id, l.id, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="border-l border-slate-100 px-2 py-1 text-right font-medium tabular-nums text-slate-700">{unitTypeTotal(u)}</td>
                  <td className="px-1 py-1 text-right">
                    <button type="button" onClick={() => removeType(u.id)} title="Remove unit type" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5" colSpan={2}>Units per level</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totals.beds} beds</td>
                <td colSpan={2} />
                {levels.map((l, i) => (
                  <td key={l.id} className={cn('px-1 py-1.5 text-right tabular-nums', (i === 0 || levels[i - 1].buildingId !== l.buildingId) && 'border-l border-slate-200')}>
                    {totals.byLevel[l.id]?.units ?? 0}
                  </td>
                ))}
                <td className="border-l border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-800">{totals.units}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
