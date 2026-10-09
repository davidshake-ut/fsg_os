'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/primitives';

// Ported from PlanScope's page-selector.tsx. There, it rendered plain
// checkboxes inside a server-rendered <form>; here the Builder is a client
// SPA, so it's a controlled component instead: `selected` is the source of
// truth (a Set of page numbers) and every change goes through `onChange`.
export function PlanPageSelector({ sheets, selected, onChange }) {
  const disciplines = useMemo(() => {
    const seen = new Set();
    for (const s of sheets) if (s.discipline) seen.add(s.discipline);
    return Array.from(seen).sort();
  }, [sheets]);

  function setMany(pageNumbers, value) {
    const next = new Set(selected);
    for (const p of pageNumbers) {
      if (value) next.add(p);
      else next.delete(p);
    }
    onChange(next);
  }

  function toggleOne(pageNumber) {
    const next = new Set(selected);
    if (next.has(pageNumber)) next.delete(pageNumber);
    else next.add(pageNumber);
    onChange(next);
  }

  const allPages = sheets.map((s) => s.page_number);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="mr-1 text-slate-400">{selected.size} of {sheets.length} pages selected</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setMany(allPages, true)}>Select all</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setMany(allPages, false)}>Select none</Button>
        {disciplines.map((d) => {
          const pagesForDiscipline = sheets.filter((s) => s.discipline === d).map((s) => s.page_number);
          return (
            <Button key={d} type="button" size="sm" variant="outline" onClick={() => setMany(pagesForDiscipline, true)} title={`Select only ${d} sheets`}>
              + {d}
            </Button>
          );
        })}
      </div>

      <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border border-slate-200 text-sm">
        {sheets.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-1.5">
            <input
              type="checkbox"
              checked={selected.has(s.page_number)}
              onChange={() => toggleOne(s.page_number)}
              className="h-4 w-4 shrink-0"
            />
            <span className="shrink-0 font-mono text-xs text-slate-500">
              p{String(s.page_number).padStart(3, '0')} · {s.sheet_number ?? '—'}
            </span>
            <span className="flex-1 truncate px-2 text-slate-600">{s.title ?? ''}</span>
            <span className="shrink-0 text-xs text-slate-400">{s.discipline ?? ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
