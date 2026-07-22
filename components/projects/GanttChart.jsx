'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';
import { PALETTE, PALETTE_MAP } from '@/hooks/useRoleColors';

// ── Tech section colors (unchanged) ─────────────────────────────────────────
const TECH_COLORS = {
  'Wi-Fi':          { bar: 'bg-blue-400',    header: 'bg-blue-50 text-blue-700'     },
  'Cameras':        { bar: 'bg-orange-400',  header: 'bg-orange-50 text-orange-700' },
  'Access Control': { bar: 'bg-purple-400',  header: 'bg-purple-50 text-purple-700' },
  'Cellular':       { bar: 'bg-green-400',   header: 'bg-green-50 text-green-700'   },
  'Networking':     { bar: 'bg-indigo-400',  header: 'bg-indigo-50 text-indigo-700' },
  'Cabling':        { bar: 'bg-amber-400',   header: 'bg-amber-50 text-amber-700'   },
  'AV':             { bar: 'bg-rose-400',    header: 'bg-rose-50 text-rose-700'     },
};
const DEFAULT_SECTION = { bar: 'bg-slate-400', header: 'bg-slate-100 text-slate-600' };

// ── Layout constants ──────────────────────────────────────────────────────────
const DAY_MS  = 86_400_000;
const LABEL_W = 256;   // px — left panel
const DAY_PX  = 8;     // px per day
const ROW_H   = 52;    // px — milestone/task rows (tall enough for name + dates)
const SEC_H   = 32;    // px — section header rows

// ── Helpers ───────────────────────────────────────────────────────────────────
function dayOff(dateStr, minDate) {
  return Math.round((new Date(dateStr + 'T00:00:00') - minDate) / DAY_MS);
}

function addDays(dateStr, days) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtShort(iso) {
  if (!iso) return null;
  return fmtDateShared(iso);
}

// ── GanttDateField — click-to-edit date chip ─────────────────────────────────
function GanttDateField({ value, onChange, placeholder }) {
  const [editing, setEditing] = useState(false);
  if (!onChange) {
    return (
      <span className={cn('text-[10px]', value ? 'text-slate-500' : 'text-slate-300')}>
        {value ? fmtShort(value) : placeholder}
      </span>
    );
  }
  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value ?? ''}
        autoFocus
        onBlur={(e) => { onChange(e.target.value || null); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className="w-28 rounded border border-blue-300 bg-white px-1 py-0 text-[10px] outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-white/70',
        value ? 'text-slate-500' : 'text-slate-300 hover:text-slate-400'
      )}
      title={onChange ? 'Click to edit' : undefined}
    >
      {value ? fmtShort(value) : placeholder}
    </button>
  );
}

// ── MonthHeader ───────────────────────────────────────────────────────────────
function MonthHeader({ minDate, totalDays }) {
  const marks = [];
  const d = new Date(minDate);
  d.setDate(1);
  while (dayOff(d.toISOString().slice(0, 10), minDate) <= totalDays) {
    marks.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      left: Math.max(0, dayOff(d.toISOString().slice(0, 10), minDate)) * DAY_PX,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return (
    <div className="relative h-8 border-b border-slate-200" style={{ width: totalDays * DAY_PX }}>
      {marks.map((m, i) => (
        <div
          key={i}
          className="absolute top-0 flex h-full items-center border-l border-slate-200 pl-1.5 text-[10px] font-medium text-slate-400"
          style={{ left: m.left }}
        >
          {m.label}
        </div>
      ))}
    </div>
  );
}

// ── MonthGridLines ────────────────────────────────────────────────────────────
function MonthGridLines({ minDate, totalDays }) {
  const offs = [];
  const d = new Date(minDate);
  d.setDate(1);
  while (dayOff(d.toISOString().slice(0, 10), minDate) <= totalDays) {
    offs.push(dayOff(d.toISOString().slice(0, 10), minDate));
    d.setMonth(d.getMonth() + 1);
  }
  return (
    <>
      {offs.map((off, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: off * DAY_PX }} />
      ))}
    </>
  );
}

// ── TodayLine ─────────────────────────────────────────────────────────────────
function TodayLine({ minDate, totalDays }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const off = (today - minDate) / DAY_MS;
  if (off < 0 || off > totalDays) return null;
  return (
    <div
      className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-400 opacity-70"
      style={{ left: off * DAY_PX }}
      title={`Today: ${fmtDateShared(today)}`}
    />
  );
}

// ── DraggableBar ─────────────────────────────────────────────────────────────
// When onSave is provided, left/right handles resize the bar and the center
// drags both dates together. Fires onSave(newStart, newEnd) on mouse-up.
function DraggableBar({ startDate, dueDate, minDate, barClass, label, thick, onSave, onOpenEdit, onConnectStart }) {
  const [ls, setLs] = useState(startDate);
  const [le, setLe] = useState(dueDate);
  const [dragging, setDragging] = useState(false);
  const curRef = useRef({ start: startDate, end: dueDate });
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) {
      setLs(startDate); setLe(dueDate);
      curRef.current = { start: startDate, end: dueDate };
    }
  }, [startDate, dueDate]);

  const hasS = Boolean(ls);
  const hasE = Boolean(le);
  if (!hasS && !hasE) return null;

  const sOff = hasS ? dayOff(ls, minDate) : dayOff(le, minDate);
  const eOff = hasE ? dayOff(le, minDate) : sOff;
  const left  = Math.max(0, sOff) * DAY_PX;
  const width = Math.max(DAY_PX, (Math.max(eOff, sOff) - Math.max(0, sOff)) * DAY_PX);
  const isPoint = !hasS || !hasE || sOff === eOff;

  const startDrag = (kind) => (evt) => {
    if (!onSave && !onOpenEdit) return;
    evt.preventDefault(); evt.stopPropagation();
    draggingRef.current = true;
    setDragging(true);
    const startX = evt.clientX;
    const origS = curRef.current.start;
    const origE = curRef.current.end;
    let moved = false;

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!onSave) return;
      const d = Math.round((ev.clientX - startX) / DAY_PX);
      let ns = origS, ne = origE;
      if (kind === 'body')  { ns = addDays(origS, d); ne = addDays(origE, d); }
      else if (kind === 'start' && origS) { ns = addDays(origS, d); if (ne && ns > ne) ns = ne; }
      else if (kind === 'end'   && origE) { ne = addDays(origE, d); if (ns && ne < ns) ne = ns; }
      curRef.current = { start: ns, end: ne };
      setLs(ns); setLe(ne);
    };
    const onUp = () => {
      draggingRef.current = false;
      setDragging(false);
      // A press-and-release without movement is a CLICK — open the shared
      // Edit Task dialog instead of a no-op date save.
      if (!moved && kind === 'body' && onOpenEdit) onOpenEdit();
      else if (moved && onSave) onSave(curRef.current.start, curRef.current.end);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      title={`${label}${ls ? `\nStart: ${ls}` : ''}${le ? `\nDue: ${le}` : ''}`}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 group select-none',
        barClass,
        thick ? 'h-4' : 'h-3',
        isPoint ? 'w-3 rounded-full' : 'rounded-full',
        dragging ? 'opacity-100 shadow-md' : 'opacity-85 hover:opacity-95'
      )}
      style={{ left, width: isPoint ? undefined : width }}
      onMouseDown={(isPoint || !onSave) && onOpenEdit ? (e) => startDrag('body')(e) : undefined}
    >
      {!isPoint && onSave && (
        <>
          {/* Left resize handle */}
          {hasS && (
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize"
              onMouseDown={(e) => startDrag('start')(e)}
            >
              <div className="absolute left-0.5 top-1/2 -translate-y-1/2 h-3/4 w-0.5 rounded-full bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          {/* Center — move both dates */}
          <div
            className={cn(
              'absolute top-0 bottom-0',
              hasS ? 'left-2' : 'left-0',
              hasE ? 'right-2' : 'right-0',
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            )}
            onMouseDown={(e) => startDrag('body')(e)}
          />
          {/* Right resize handle */}
          {hasE && (
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize"
              onMouseDown={(e) => startDrag('end')(e)}
            >
              <div className="absolute right-0.5 top-1/2 -translate-y-1/2 h-3/4 w-0.5 rounded-full bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </>
      )}
      {/* Dependency connector — drag onto another task's bar */}
      {onConnectStart && (
        <span
          title="Drag to another task to make it start after this one"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onConnectStart(e); }}
          className="absolute -right-3 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-500 bg-white opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </div>
  );
}

// ── DependencyLines ──────────────────────────────────────────────────────────
// Connector from the end of a dependency's bar to the start of the dependent
// task's bar. Red/dashed when the dependent is scheduled to start before its
// dependency finishes — a real scheduling conflict, not just a visual link.
// This is NOT full critical-path (longest-path) analysis — just per-edge
// conflict detection, which is the practical value for a small project team.
function DependencyLines({ rows, rowMeta, minDate }) {
  const taskRowIndex = new Map();
  rows.forEach((row, i) => { if (row.kind === 'task') taskRowIndex.set(row.item.id, i); });

  const lines = [];
  rows.forEach((row) => {
    if (row.kind !== 'task') return;
    const taskIdx = taskRowIndex.get(row.item.id);
    for (const depId of row.item.depends_on ?? []) {
      const depIdx = taskRowIndex.get(depId);
      if (depIdx == null) continue; // dependency deleted or filtered out — skip silently
      const depItem = rows[depIdx].item;
      if (!depItem.due_date || !row.item.start_date) continue; // need real dates to draw a line
      const x1 = Math.max(0, dayOff(depItem.due_date, minDate)) * DAY_PX;
      const y1 = rowMeta[depIdx].top + rowMeta[depIdx].h / 2;
      const x2 = Math.max(0, dayOff(row.item.start_date, minDate)) * DAY_PX;
      const y2 = rowMeta[taskIdx].top + rowMeta[taskIdx].h / 2;
      const conflict = new Date(row.item.start_date + 'T00:00:00') < new Date(depItem.due_date + 'T00:00:00');
      lines.push({ key: `${depId}->${row.item.id}`, x1, y1, x2, y2, conflict });
    }
  });

  if (lines.length === 0) return null;
  const totalH = rowMeta.length ? rowMeta.at(-1).top + rowMeta.at(-1).h : 0;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={Math.max(...lines.map((l) => Math.max(l.x1, l.x2))) + 20}
      height={totalH}
    >
      <defs>
        <marker id="gantt-dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
        <marker id="gantt-dep-arrow-danger" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" />
        </marker>
      </defs>
      {lines.map((l) => {
        const midX = (l.x1 + l.x2) / 2;
        return (
          <path
            key={l.key}
            d={`M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`}
            fill="none"
            stroke={l.conflict ? '#dc2626' : '#94a3b8'}
            strokeWidth={l.conflict ? 1.5 : 1}
            strokeDasharray={l.conflict ? '4 2' : undefined}
            markerEnd={l.conflict ? 'url(#gantt-dep-arrow-danger)' : 'url(#gantt-dep-arrow)'}
          />
        );
      })}
    </svg>
  );
}

// ── RoleColorEditor ───────────────────────────────────────────────────────────
function RoleColorEditor({ roles, getRoleColor, setRoleColor, onClose }) {
  if (roles.length === 0) {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-400">No roles assigned to tasks yet. Add a role in the Tasks tab.</p>
      </div>
    );
  }
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Role Colors</p>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-400 hover:text-slate-600">
          <X size={13} />
        </button>
      </div>
      <div className="space-y-2">
        {roles.map((role) => {
          const current = getRoleColor(role);
          const pal = PALETTE_MAP[current] ?? PALETTE_MAP.slate;
          return (
            <div key={role} className="flex items-center gap-3">
              <span className={cn('w-28 shrink-0 truncate rounded-full px-2 py-0.5 text-center text-[10px] font-medium', pal.badge)}>
                {role}
              </span>
              <div className="flex flex-wrap gap-1">
                {PALETTE.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    onClick={() => setRoleColor(role, p.name)}
                    style={{ backgroundColor: p.hex }}
                    className={cn(
                      'h-4 w-4 rounded-full transition-transform hover:scale-110',
                      current === p.name && 'ring-2 ring-offset-1 ring-slate-500 scale-110'
                    )}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── GanttChart ────────────────────────────────────────────────────────────────
export default function GanttChart({
  technologies = [],
  milestones   = [],
  tasks        = [],
  members      = [],
  onUpdateMilestone,
  onUpdateTask,
  onEditTask,
  getRoleColor,
  setRoleColor,
  allowDependencies = true, // module-variant toggle: hides the connect handles
}) {
  const [showColors, setShowColors] = useState(false);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  // In-progress dependency connect-drag: from a bar's connector dot to
  // another task's row. Drawn as a dashed line; dropping on a task row
  // writes the edge into that task's depends_on (it starts after the source).
  const [connect, setConnect] = useState(null); // { fromId, x1, y1, x2, y2 }

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Unique roles present in tasks
  const uniqueRoles = useMemo(
    () => [...new Set(tasks.filter((t) => t.role).map((t) => t.role))].sort(),
    [tasks]
  );

  // Date range
  const { minDate, totalDays } = useMemo(() => {
    const dates = [
      ...milestones.flatMap((m) => [m.start_date, m.due_date]),
      ...tasks.flatMap((t) => [t.start_date, t.due_date]),
    ].filter(Boolean).map((d) => new Date(d + 'T00:00:00'));

    if (dates.length === 0) return { minDate: null, totalDays: 0 };

    const minTs = Math.min(...dates.map((d) => d.getTime()));
    const maxTs = Math.max(...dates.map((d) => d.getTime()));
    const min = new Date(minTs - 7 * DAY_MS);
    const max = new Date(maxTs + 14 * DAY_MS);
    min.setHours(0, 0, 0, 0);
    max.setHours(0, 0, 0, 0);
    return { minDate: min, totalDays: Math.ceil((max - min) / DAY_MS) };
  }, [milestones, tasks]);

  // Build row list
  const rows = useMemo(() => {
    const list = [];

    const addMilestoneAndTasks = (m, depth, sectionColors) => {
      list.push({ kind: 'milestone', item: m, depth, sectionColors });
      tasks
        .filter((t) => t.milestone_id === m.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((t) => list.push({ kind: 'task', item: t, depth: depth + 1, sectionColors }));
    };

    if (technologies.length === 0) {
      milestones.forEach((m) => addMilestoneAndTasks(m, 0, DEFAULT_SECTION));
      tasks.filter((t) => !t.milestone_id).forEach((t) =>
        list.push({ kind: 'task', item: t, depth: 0, sectionColors: DEFAULT_SECTION })
      );
    } else {
      technologies.forEach((tech) => {
        const sc = TECH_COLORS[tech.technology] ?? DEFAULT_SECTION;
        list.push({ kind: 'section', item: tech, depth: 0, sectionColors: sc });
        milestones.filter((m) => m.technology_id === tech.id).forEach((m) =>
          addMilestoneAndTasks(m, 1, sc)
        );
        tasks.filter((t) => t.technology_id === tech.id && !t.milestone_id).forEach((t) =>
          list.push({ kind: 'task', item: t, depth: 1, sectionColors: sc })
        );
      });

      const unassMs    = milestones.filter((m) => !m.technology_id);
      const unassTasks = tasks.filter((t) => !t.technology_id && !t.milestone_id);
      if (unassMs.length > 0 || unassTasks.length > 0) {
        list.push({ kind: 'section', item: { technology: 'Unassigned' }, depth: 0, sectionColors: DEFAULT_SECTION });
        unassMs.forEach((m) => addMilestoneAndTasks(m, 1, DEFAULT_SECTION));
        unassTasks.forEach((t) => list.push({ kind: 'task', item: t, depth: 1, sectionColors: DEFAULT_SECTION }));
      }
    }
    return list;
  }, [technologies, milestones, tasks]);

  // Per-row heights and cumulative tops
  const rowMeta = useMemo(() => {
    let top = 0;
    return rows.map((row) => {
      const h = row.kind === 'section' ? SEC_H : ROW_H;
      const result = { top, h };
      top += h;
      return result;
    });
  }, [rows]);

  const totalH = rowMeta.reduce((s, m) => s + m.h, 0);
  const chartW = Math.max(600, totalDays * DAY_PX);

  // Drag from a task bar's connector dot; drop on another task's row to
  // create "target starts after source". Coordinates live in the content
  // div's space (the rect is re-read per event so horizontal scroll is
  // accounted for); the drop row comes from the rowMeta geometry.
  const startConnect = (fromTask, rowIndex) => (evt) => {
    const content = contentRef.current;
    if (!content) return;
    const rect = () => content.getBoundingClientRect();
    const r0 = rect();
    const anchor = fromTask.due_date || fromTask.start_date;
    const x1 = anchor ? (dayOff(anchor, minDate) + 1) * DAY_PX : evt.clientX - r0.left;
    const y1 = rowMeta[rowIndex].top + rowMeta[rowIndex].h / 2;
    setConnect({ fromId: fromTask.id, x1, y1, x2: evt.clientX - r0.left, y2: evt.clientY - r0.top });

    const onMove = (e) => {
      const r = rect();
      setConnect((c) => (c ? { ...c, x2: e.clientX - r.left, y2: e.clientY - r.top } : c));
    };
    const onUp = (e) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setConnect(null);
      const r = rect();
      const y = e.clientY - r.top;
      const idx = rowMeta.findIndex((m) => y >= m.top && y < m.top + m.h);
      const target = idx >= 0 ? rows[idx] : null;
      if (!target || target.kind !== 'task') return;
      const t = target.item;
      if (
        t.id === fromTask.id ||
        (t.depends_on ?? []).includes(fromTask.id) ||
        (fromTask.depends_on ?? []).includes(t.id) // direct-cycle guard
      ) {
        return;
      }
      onUpdateTask?.(t.id, { depends_on: [...(t.depends_on ?? []), fromTask.id] });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!minDate) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 text-center">
        <p className="text-sm font-medium text-slate-500">No dates set yet</p>
        <p className="max-w-xs text-xs text-slate-400">
          Click the date fields on tasks or milestones in the Tasks tab to add start and due dates.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <p className="text-xs font-medium text-slate-500">Gantt Chart</p>
        <button
          type="button"
          onClick={() => setShowColors((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
            showColors
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
          )}
        >
          <Palette size={12} /> Role Colors
        </button>
      </div>

      {/* Role color editor */}
      {showColors && (
        <RoleColorEditor
          roles={uniqueRoles}
          getRoleColor={getRoleColor ?? (() => 'slate')}
          setRoleColor={setRoleColor ?? (() => {})}
          onClose={() => setShowColors(false)}
        />
      )}

      {/* Header row */}
      <div className="flex border-b border-slate-200 bg-white">
        <div
          className="shrink-0 border-r border-slate-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          style={{ width: LABEL_W }}
        >
          Item / Dates
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'none' }} ref={scrollRef}>
            <MonthHeader minDate={minDate} totalDays={totalDays} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex">

        {/* Left: labels + date fields */}
        <div className="shrink-0 border-r border-slate-200" style={{ width: LABEL_W }}>
          {rows.map((row, i) => {
            const { h } = rowMeta[i];
            const isSection = row.kind === 'section';
            const isMilestone = row.kind === 'milestone';
            const isTask = row.kind === 'task';
            const pl = 12 + row.depth * 14;

            if (isSection) {
              return (
                <div
                  key={i}
                  className={cn('flex items-center border-b border-slate-100 text-xs font-semibold', row.sectionColors.header)}
                  style={{ height: h, paddingLeft: pl, paddingRight: 8 }}
                >
                  <span className="truncate">{row.item.technology}</span>
                </div>
              );
            }

            const onUpdate = isMilestone
              ? (field, val) => onUpdateMilestone?.(row.item.id, { [field]: val })
              : (field, val) => onUpdateTask?.(row.item.id, { [field]: val });

            const assignee = isTask ? membersById.get(row.item.assignee_id) : null;
            return (
              <div
                key={i}
                className="flex flex-col justify-center border-b border-slate-50 last:border-0"
                style={{ height: h, paddingLeft: pl, paddingRight: 8 }}
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn('min-w-0 flex-1 truncate text-xs', isMilestone ? 'font-semibold text-slate-700' : 'text-slate-500')}>
                    {isMilestone ? `◆ ${row.item.name}` : `• ${row.item.title}`}
                  </span>
                  {assignee && (
                    <span
                      title={assignee.full_name || assignee.email}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[8px] font-semibold text-blue-700"
                    >
                      {initials(assignee.full_name, assignee.email)}
                    </span>
                  )}
                </span>
                <div className="mt-0.5 flex items-center gap-1">
                  <GanttDateField
                    value={row.item.start_date}
                    onChange={(v) => onUpdate('start_date', v)}
                    placeholder="Start"
                  />
                  <span className="text-[10px] text-slate-200">–</span>
                  <GanttDateField
                    value={row.item.due_date}
                    onChange={(v) => onUpdate('due_date', v)}
                    placeholder="Due"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: scrollable date bars */}
        <div className="flex-1 overflow-x-auto">
          <div ref={contentRef} className="relative" style={{ width: chartW, height: totalH }}>

            <MonthGridLines minDate={minDate} totalDays={totalDays} />
            <TodayLine minDate={minDate} totalDays={totalDays} />

            {rows.map((row, i) => {
              const { top, h } = rowMeta[i];
              const isSection = row.kind === 'section';

              // Determine bar color
              let barClass = row.sectionColors.bar;
              if (row.kind === 'task' && getRoleColor) {
                const colorName = getRoleColor(row.item.role ?? '');
                barClass = (PALETTE_MAP[colorName] ?? PALETTE_MAP.slate).bar;
              }

              // Section span bar (across all its milestones' dates)
              let sectionSpan = null;
              if (isSection && row.item.id) {
                const sMs = milestones.filter((m) => m.technology_id === row.item.id);
                const ds = [
                  ...sMs.filter((m) => m.start_date).map((m) => m.start_date),
                  ...sMs.filter((m) => m.due_date).map((m) => m.due_date),
                ].sort();
                if (ds.length >= 2) {
                  sectionSpan = { startDate: ds[0], dueDate: ds.at(-1) };
                }
              }

              return (
                <div
                  key={i}
                  className={cn(
                    'absolute left-0 right-0 border-b border-slate-50',
                    isSection && 'opacity-20 ' + row.sectionColors.header
                  )}
                  style={{ top, height: h }}
                >
                  {!isSection && (
                    <DraggableBar
                      startDate={row.item.start_date}
                      dueDate={row.item.due_date}
                      minDate={minDate}
                      barClass={barClass}
                      label={row.item.name ?? row.item.title ?? ''}
                      thick={row.kind === 'milestone'}
                      onSave={
                        row.kind === 'milestone'
                          ? (s, e) => onUpdateMilestone?.(row.item.id, { start_date: s, due_date: e })
                          : (s, e) => onUpdateTask?.(row.item.id, { start_date: s, due_date: e })
                      }
                      onOpenEdit={row.kind === 'task' && onEditTask ? () => onEditTask(row.item) : undefined}
                      onConnectStart={
                        row.kind === 'task' && onUpdateTask && allowDependencies ? startConnect(row.item, i) : undefined
                      }
                    />
                  )}
                  {isSection && sectionSpan && (
                    <DraggableBar
                      startDate={sectionSpan.startDate}
                      dueDate={sectionSpan.dueDate}
                      minDate={minDate}
                      barClass={barClass}
                      label={row.item.technology ?? ''}
                      thick={false}
                    />
                  )}
                </div>
              );
            })}

            <DependencyLines rows={rows} rowMeta={rowMeta} minDate={minDate} />

            {/* Live connector while dragging a new dependency */}
            {connect && (
              <svg className="pointer-events-none absolute inset-0 z-20" width={chartW} height={totalH}>
                <line
                  x1={connect.x1}
                  y1={connect.y1}
                  x2={connect.x2}
                  y2={connect.y2}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <circle cx={connect.x2} cy={connect.y2} r="3.5" fill="#3b82f6" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
