'use client';

import { PackageOpen } from 'lucide-react';
import { hardwareLines } from '@/lib/bomSnapshot';

// "What was sold/installed" — hardware lines from the accepted proposal's
// bom_snapshot. Shared by the project Overview and the support ticket
// detail so anyone touching the job sees the same parts list. Renders
// nothing when there's no snapshot (proposal never sent/accepted, or
// pre-dates migration 0041).
export default function InstalledEquipment({ bomSnapshot, title = 'Installed Equipment' }) {
  const lines = hardwareLines(bomSnapshot);
  if (lines.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <PackageOpen size={14} className="text-slate-400" /> {title}
      </h2>
      <div className="divide-y divide-slate-100">
        {lines.map((line, i) => (
          <div key={`${line.sku ?? 'line'}-${i}`} className="flex items-center gap-3 py-2">
            <span className="w-10 shrink-0 text-right font-mono text-sm font-semibold text-slate-700">{line.qty}×</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-800">{line.description}</p>
              <p className="text-xs text-slate-400">{line.category}{line.sku ? ` · ${line.sku}` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
