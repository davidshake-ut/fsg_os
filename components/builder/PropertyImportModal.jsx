'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, ClipboardPaste, AlertTriangle } from 'lucide-react';
import { Button, Select, TextInput } from '@/components/ui/primitives';
import { parseDelimited } from '@/lib/csv';
import {
  guessUnitScheduleMapping,
  parseUnitSchedule,
  propertyFromImport,
  normalizePropertyModel,
  propertyTotals,
  columnHeaders,
  levelHeaderName,
} from '@/lib/propertyModel';
import { cn } from '@/lib/utils';

// Imports the architect's unit mix into the property model: paste the
// range straight from Excel / Sheets (headers included) or upload a CSV,
// confirm which columns are the unit type, bedrooms, square footage, and
// the per-level counts, and the buildings / levels / telecom rooms are
// created from the level captions.

const ROLES = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'code', label: 'Unit type' },
  { value: 'description', label: 'Description' },
  { value: 'bedrooms', label: 'Bedrooms' },
  { value: 'sqft', label: 'Sq ft' },
  { value: 'level', label: 'Level counts' },
];

const colLetter = (i) => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export default function PropertyImportModal({ open, hasExisting = false, onClose, onApply }) {
  const [step, setStep] = useState('paste');
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const reset = () => {
    setStep('paste');
    setText('');
    setRows([]);
    setMapping(null);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const analyze = (raw) => {
    const parsed = parseDelimited(raw).filter((r) => r.some((c) => String(c).trim() !== ''));
    if (parsed.length < 2) {
      setError('Paste at least a header row and one unit row.');
      return;
    }
    setRows(parsed);
    setMapping(guessUnitScheduleMapping(parsed));
    setError(null);
    setStep('map');
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const raw = await file.text();
    setText(raw);
    analyze(raw);
  };

  const roleOf = (c) => {
    if (!mapping) return 'ignore';
    if (mapping.codeCol === c) return 'code';
    if (mapping.descriptionCol === c) return 'description';
    if (mapping.bedroomsCol === c) return 'bedrooms';
    if (mapping.sqftCol === c) return 'sqft';
    if (mapping.levelCols.some((l) => l.col === c)) return 'level';
    return 'ignore';
  };

  const setRole = (c, role) => {
    setMapping((m) => {
      const next = {
        ...m,
        codeCol: m.codeCol === c ? -1 : m.codeCol,
        descriptionCol: m.descriptionCol === c ? -1 : m.descriptionCol,
        bedroomsCol: m.bedroomsCol === c ? -1 : m.bedroomsCol,
        sqftCol: m.sqftCol === c ? -1 : m.sqftCol,
        levelCols: m.levelCols.filter((l) => l.col !== c),
      };
      if (role === 'code') next.codeCol = c;
      if (role === 'description') next.descriptionCol = c;
      if (role === 'bedrooms') next.bedroomsCol = c;
      if (role === 'sqft') next.sqftCol = c;
      if (role === 'level') {
        next.levelCols = [...next.levelCols, { col: c, name: levelHeaderName(m.headers[c]) }].sort((a, b) => a.col - b.col);
      }
      return next;
    });
  };

  const setLevelName = (c, name) =>
    setMapping((m) => ({ ...m, levelCols: m.levelCols.map((l) => (l.col === c ? { ...l, name } : l)) }));

  const setHeaderRows = (n) =>
    setMapping((m) => {
      const headers = columnHeaders(rows, n);
      return {
        ...m,
        headerRows: n,
        headers,
        levelCols: m.levelCols.map((l) => ({ ...l, name: levelHeaderName(headers[l.col]) })),
      };
    });

  const parsed = mapping ? parseUnitSchedule(rows, mapping) : null;
  const preview = parsed ? propertyTotals(normalizePropertyModel(propertyFromImport(parsed))) : null;
  const ready = !!parsed && parsed.unitTypes.length > 0 && mapping.levelCols.length > 0 && mapping.codeCol >= 0 && mapping.bedroomsCol >= 0;

  const apply = () => {
    if (!ready) return;
    onApply(propertyFromImport(parseUnitSchedule(rows, mapping)));
    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="property-import-title">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={close} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p id="property-import-title" className="text-sm font-semibold text-slate-900">Import unit schedule</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === 'paste'
                ? 'Copy the unit mix from the architect\'s spreadsheet with its header rows and paste it below, or upload a CSV.'
                : 'Confirm what each column is. Buildings, levels, and telecom rooms are created from the level captions.'}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === 'paste' && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={'UNIT TYPE\tDESCRIPTION\tBEDS\tSQ FT\tBLDG 1-LVL 1\tBLDG 1-LVL 2\t…\nA1\t1 BEDROOM / 1 BATH\t1\t628\t2\t2\t…'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertTriangle size={13} /> {error}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => analyze(text)} disabled={!text.trim()}>
                  <ClipboardPaste size={14} /> Read pasted table
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> Upload CSV
                </Button>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="hidden" onChange={handleFile} />
              </div>
            </div>
          )}

          {step === 'map' && mapping && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  Header rows
                  <Select className="h-8 w-20" value={mapping.headerRows} onChange={(e) => setHeaderRows(Number(e.target.value))}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </label>
                <span className="text-xs text-slate-400">{rows.length} rows read · {parsed.unitTypes.length} unit types recognized{parsed.skipped ? ` · ${parsed.skipped} rows skipped (no bedroom count)` : ''}</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-medium">Col</th>
                      <th className="px-3 py-2 font-medium">Header</th>
                      <th className="px-3 py-2 font-medium">Use as</th>
                      <th className="px-3 py-2 font-medium">Level name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.headers.map((h, c) => {
                      const role = roleOf(c);
                      const lvl = mapping.levelCols.find((l) => l.col === c);
                      return (
                        <tr key={c} className={cn('border-b border-slate-50 last:border-0', role === 'ignore' ? 'text-slate-400' : 'text-slate-700')}>
                          <td className="px-3 py-1.5 font-mono text-xs">{colLetter(c)}</td>
                          <td className="max-w-[220px] truncate px-3 py-1.5 text-xs" title={h}>{h || <span className="italic text-slate-300">blank</span>}</td>
                          <td className="px-3 py-1.5">
                            <Select className="h-8 text-xs" value={role} onChange={(e) => setRole(c, e.target.value)}>
                              {ROLES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-3 py-1.5">
                            {lvl && (
                              <TextInput className="h-8 text-xs" value={lvl.name} onChange={(e) => setLevelName(c, e.target.value)} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {preview && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Unit types', preview.unitTypes],
                    ['Units', preview.units],
                    ['Beds', preview.beds],
                    ['Buildings', preview.buildings],
                    ['Levels', preview.levels],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="text-lg font-semibold tabular-nums text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {!ready && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} /> Mark a Unit type column, a Bedrooms column, and at least one Level counts column.
                </p>
              )}
              {hasExisting && ready && (
                <p className="text-xs text-slate-500">Importing replaces the current buildings, levels, telecom rooms, and unit schedule. Amenity, outdoor, and drop lists are kept.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          {step === 'map' ? (
            <Button variant="outline" onClick={() => setStep('paste')}>Back</Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            {step === 'map' && (
              <Button onClick={apply} disabled={!ready}>
                {hasExisting ? 'Replace schedule' : 'Import schedule'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
