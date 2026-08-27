'use client';

import { Server, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

// The per-closet switch plan the Wi-Fi engine derived in takeoff mode:
// one row per telecom room (plus the townhome group), APs, spare-port
// count, PoE load, and the 8 / 24 / 48-port mix. Any room can be switched
// to a hand-set mix (a second closet for cable distance, a spare) — that
// override rides the quote at inputs.wifiTakeoff.roomOverrides.

const cellInput =
  'w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-sm tabular-nums text-slate-700 outline-none focus:border-blue-400';

export default function IdfPlanCard({ bom, takeoff, onOverride }) {
  const plan = bom?.idfPlan ?? [];
  if (!bom?.takeoffUsed || plan.length === 0) return null;

  const totals = plan.reduce(
    (t, p) => ({
      units: t.units + p.units,
      aps: t.aps + p.aps,
      ports: t.ports + p.ports,
      s8: t.s8 + p.s8,
      s24: t.s24 + p.s24,
      s48: t.s48 + p.s48,
      capacity: t.capacity + p.s8 * 8 + p.s24 * 24 + p.s48 * 48,
      poe: t.poe + (p.poeWatts ?? 0),
    }),
    { units: 0, aps: 0, ports: 0, s8: 0, s24: 0, s48: 0, capacity: 0, poe: 0 }
  );
  const hasPoe = plan.some((p) => p.poeWatts != null);
  const setMix = (p, key, value) =>
    onOverride(p.roomId, { s8: p.s8, s24: p.s24, s48: p.s48, [key]: Math.max(0, Number(value) || 0) });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Server size={14} className="text-slate-400" /> IDF Plan
          <span className="text-xs font-normal text-slate-400">
            {plan.filter((p) => !p.townhome).length} telecom room{plan.filter((p) => !p.townhome).length === 1 ? '' : 's'} · {totals.s8 + totals.s24 + totals.s48} switches · {totals.capacity} ports for {totals.ports} needed
          </span>
        </h3>
        <p className="text-[11px] text-slate-400">Sized per closet from PoE budget and ports. Tick a row to set its mix by hand.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Room</th>
              <th className="px-3 py-2 font-medium">Levels</th>
              <th className="px-2 py-2 text-right font-medium">Units</th>
              <th className="px-2 py-2 text-right font-medium">APs</th>
              <th className="px-2 py-2 text-right font-medium" title="APs plus the spare-port percentage">Ports</th>
              {hasPoe && <th className="px-2 py-2 text-right font-medium">PoE load</th>}
              <th className="px-2 py-2 text-right font-medium">8-port</th>
              <th className="px-2 py-2 text-right font-medium">24-port</th>
              <th className="px-2 py-2 text-right font-medium">48-port</th>
              <th className="px-2 py-2 text-right font-medium">Manual</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.roomId ?? 'townhomes'} className={cn('border-b border-slate-50 last:border-0', p.overridden && 'bg-amber-50/40')}>
                <td className="px-3 py-1.5 font-medium text-slate-700">
                  {p.name}
                  {p.isMdf && <span className="ml-1.5 rounded-full border border-blue-200 bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700">MDF</span>}
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-500">{p.levelNames.join(', ') || (p.townhome ? 'per unit' : '—')}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{p.units}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{p.aps}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.ports}</td>
                {hasPoe && <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{p.poeWatts != null ? `${p.poeWatts} W` : '—'}</td>}
                {['s8', 's24', 's48'].map((k) => (
                  <td key={k} className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {p.overridden && !p.townhome ? (
                      <input type="number" min="0" className={cellInput} value={p[k]} onChange={(e) => setMix(p, k, e.target.value)} />
                    ) : (
                      p[k] || <span className="text-slate-300">0</span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  {p.townhome ? (
                    <span className="text-[10px] text-slate-400">rule</span>
                  ) : p.overridden ? (
                    <button
                      type="button"
                      onClick={() => onOverride(p.roomId, null)}
                      title="Back to the computed mix"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                    >
                      <RotateCcw size={11} /> reset
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => onOverride(p.roomId, { s8: p.s8, s24: p.s24, s48: p.s48 })}
                      title="Set this room's switch mix by hand"
                      className="h-3.5 w-3.5 accent-blue-600"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <td className="px-3 py-1.5" colSpan={2}>Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.units}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.aps}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.ports}</td>
              {hasPoe && <td className="px-2 py-1.5 text-right tabular-nums">{totals.poe} W</td>}
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.s8}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.s24}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.s48}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {(bom.inUnitSwitches > 0 || (takeoff?.unassignedLevelIds?.length ?? 0) > 0) && (
        <div className="space-y-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          {bom.inUnitSwitches > 0 && (
            <p>
              {bom.inUnitSwitches} in-unit switch{bom.inUnitSwitches === 1 ? '' : 'es'} for units designed with 2+ APs
              {takeoff?.inUnitSwitchSku ? '' : ' — pick a product in the Design Source panel to price them'}.
            </p>
          )}
          {(takeoff?.unassignedLevelIds?.length ?? 0) > 0 && (
            <p className="text-amber-700">
              {takeoff.unassignedLevelIds.length} level{takeoff.unassignedLevelIds.length === 1 ? '' : 's'} without a telecom room: {takeoff.unassignedAPs} AP{takeoff.unassignedAPs === 1 ? '' : 's'} counted but not switched.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
