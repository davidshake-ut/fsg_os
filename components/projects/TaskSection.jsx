'use client';

import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  User,
  UserCircle2,
  Calendar,
  ArrowRight,
  Copy,
  Link2,
  Pencil,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';
import ConfirmModal from '@/components/ui/ConfirmModal';

function fmtDate(iso) {
  if (!iso) return null;
  return fmtDateShared(iso);
}

// ── InlineEdit ──────────────────────────────────────────────────────────────
function InlineEdit({ value = '', onCommit, placeholder = 'Untitled', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const start = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className={cn('bg-transparent outline-none border-b border-blue-400 w-full', className)}
      />
    );
  }
  return (
    <span
      onClick={start}
      className={cn('cursor-text hover:text-blue-600 transition-colors', !value && 'text-slate-400 italic', className)}
    >
      {value || placeholder}
    </span>
  );
}

// ── DateField ────────────────────────────────────────────────────────────────
function DateField({ value, onChange, placeholder = 'Set date' }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        defaultValue={value ?? ''}
        autoFocus
        onBlur={(e) => { onChange(e.target.value || null); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className="rounded border border-blue-300 px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-slate-100',
        value ? 'text-slate-500' : 'text-slate-300 hover:text-slate-400'
      )}
    >
      <Calendar size={9} />
      {value ? fmtDate(value) : placeholder}
    </button>
  );
}

// ── AddInline ────────────────────────────────────────────────────────────────
function AddInline({ placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="flex items-center gap-1 py-1 text-xs text-slate-400 transition-colors hover:text-blue-600"
      >
        <Plus size={12} /> {placeholder}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setValue(''); setOpen(false); }
        }}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400/20"
      />
      <button type="button" onClick={() => { setValue(''); setOpen(false); }} className="text-xs text-slate-400">
        Cancel
      </button>
    </div>
  );
}

// ── MoveMenu ─────────────────────────────────────────────────────────────────
function MoveMenu({ label, items, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  if (items.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded p-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ArrowRight size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onPick(item.id); setOpen(false); }}
              className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskChecklist ────────────────────────────────────────────────────────────
function TaskChecklist({ items, onAdd, onToggle, onDelete }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id} className="group/ci flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggle(item.id, !item.is_done)}
            className="shrink-0 text-slate-300 hover:text-blue-500"
          >
            {item.is_done ? <CheckCircle2 size={13} className="text-green-500" /> : <Circle size={13} />}
          </button>
          <span className={cn('flex-1 text-xs', item.is_done ? 'text-slate-400 line-through' : 'text-slate-600')}>
            {item.label}
          </span>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="shrink-0 text-slate-200 opacity-0 transition-opacity hover:text-red-500 group-hover/ci:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      <AddInline placeholder="Add checklist item" onAdd={onAdd} />
    </div>
  );
}

// ── DependencyPicker ─────────────────────────────────────────────────────────
// Both phrasings of the same edge: "Starts after" edits THIS task's
// depends_on; "Blocks" writes this task's id into the OTHER task's
// depends_on (…must start after this one). Only direct A↔B cycles are
// guarded here; deeper cycles are tolerated by the cascade's bounded pass.
function DependencyChips({ label, chips, onRemove, candidates, onAdd, addHint }) {
  const [open, setOpen] = useState(false);
  if (chips.length === 0 && candidates.length === 0) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Link2 size={10} /> {label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((d) => (
          <span key={d.id} className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
            {d.title}
            <button type="button" onClick={() => onRemove(d.id)} className="text-amber-400 hover:text-amber-700">
              <X size={10} />
            </button>
          </span>
        ))}
        {candidates.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              title={addHint}
              className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
            >
              <Plus size={10} /> Add
            </button>
            {open && (
              <div
                className="absolute left-0 top-full z-30 mt-1 max-h-48 min-w-[200px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
                onMouseLeave={() => setOpen(false)}
              >
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onAdd(c.id); setOpen(false); }}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DependencyPicker({ task, allProjectTasks, onUpdate }) {
  const all = allProjectTasks ?? [];
  const dependsOn = task.depends_on ?? [];
  const deps = dependsOn.map((id) => all.find((t) => t.id === id)).filter(Boolean);
  const depCandidates = all.filter(
    (t) => t.id !== task.id && !dependsOn.includes(t.id) && !(t.depends_on ?? []).includes(task.id)
  );

  // The inverse direction: tasks that must start after THIS one.
  const blocks = all.filter((t) => (t.depends_on ?? []).includes(task.id));
  const blockCandidates = all.filter(
    (t) => t.id !== task.id && !(t.depends_on ?? []).includes(task.id) && !dependsOn.includes(t.id)
  );

  const addDep = (id) => onUpdate(task.id, { depends_on: [...dependsOn, id] });
  const removeDep = (id) => onUpdate(task.id, { depends_on: dependsOn.filter((d) => d !== id) });
  const addBlock = (id) => {
    const other = all.find((t) => t.id === id);
    onUpdate(id, { depends_on: [...(other?.depends_on ?? []), task.id] });
  };
  const removeBlock = (id) => {
    const other = all.find((t) => t.id === id);
    onUpdate(id, { depends_on: (other?.depends_on ?? []).filter((d) => d !== task.id) });
  };

  return (
    <div className="space-y-2">
      <DependencyChips
        label="Starts after"
        chips={deps}
        onRemove={removeDep}
        candidates={depCandidates}
        onAdd={addDep}
        addHint="This task can't start until the picked task is done"
      />
      <DependencyChips
        label="Blocks (these start after it)"
        chips={blocks}
        onRemove={removeBlock}
        candidates={blockCandidates}
        onAdd={addBlock}
        addHint="The picked task can't start until this one is done"
      />
    </div>
  );
}

// ── AssigneeMenu ─────────────────────────────────────────────────────────────
function initials(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (email || '?')[0].toUpperCase();
}

function AssigneeMenu({ members, assigneeId, onAssign }) {
  const [open, setOpen] = useState(false);
  const assignee = (members ?? []).find((m) => m.id === assigneeId);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={assignee ? `Assigned to ${assignee.full_name || assignee.email}` : 'Unassigned — click to assign'}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold transition-colors',
          assignee
            ? 'bg-blue-100 text-blue-700'
            : 'border border-dashed border-slate-300 text-slate-300 hover:border-blue-300 hover:text-blue-400'
        )}
      >
        {assignee ? initials(assignee.full_name, assignee.email) : <UserCircle2 size={12} />}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Assignee</p>
          <button
            type="button"
            onClick={() => { onAssign(null); setOpen(false); }}
            className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
          >
            Unassigned
          </button>
          {(members ?? []).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onAssign(m.id); setOpen(false); }}
              className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              {m.full_name || m.email}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CloneMenu ─────────────────────────────────────────────────────────────────
// Dropdown that offers "Clone here" + optional "Clone to [destination]" entries.
function CloneMenu({ label, onCloneHere, items = [], onCloneTo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const handleClick = () => {
    if (items.length === 0) { onCloneHere(); return; }
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={label}
        onClick={handleClick}
        className="flex items-center rounded p-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-blue-500"
      >
        <Copy size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
          <button
            type="button"
            onClick={() => { onCloneHere(); setOpen(false); }}
            className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          >
            Clone here
          </button>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onCloneTo(item.id); setOpen(false); }}
              className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              Clone to {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SortableTaskRow ───────────────────────────────────────────────────────────
function SortableTaskRow({
  task, allProjectMilestones, onUpdate, onDelete, onMoveTask, onCloneTask, onEditTask, getPalette, members,
  checklistItems, onAddChecklistItem, onToggleChecklistItem, onDeleteChecklistItem, allProjectTasks,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', milestoneId: task.milestone_id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };

  const [expanded, setExpanded] = useState(false);
  const taskChecklist = (checklistItems ?? []).filter((c) => c.task_id === task.id);
  const checklistDone = taskChecklist.filter((c) => c.is_done).length;
  const otherMilestones = (allProjectMilestones ?? []).filter((m) => m.id !== task.milestone_id);
  const openDeps = (task.depends_on ?? [])
    .map((id) => (allProjectTasks ?? []).find((t) => t.id === id))
    .filter((d) => d && d.status !== 'done');

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="flex items-start gap-1.5 rounded-lg px-1 py-1.5 hover:bg-slate-50/80">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-slate-200 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </button>

        {/* Status toggle */}
        <button
          type="button"
          onClick={() => onUpdate(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}
          className="mt-0.5 shrink-0 text-slate-300 transition-colors hover:text-blue-500"
        >
          {task.status === 'done'
            ? <CheckCircle2 size={15} className="text-green-500" />
            : <Circle size={15} />}
        </button>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <InlineEdit
              value={task.title}
              onCommit={(v) => onUpdate(task.id, { title: v })}
              className={cn('text-sm text-slate-700', task.status === 'done' && 'line-through text-slate-400')}
            />
            {task.role && (() => {
              const p = getPalette ? getPalette(task.role) : { badge: 'bg-blue-50 text-blue-600' };
              return (
                <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]', p.badge)}>
                  <User size={9} /> {task.role}
                </span>
              );
            })()}
            {task.estimated_hours != null && (
              <span className="shrink-0 text-[10px] text-slate-400">{task.estimated_hours}h</span>
            )}
            {taskChecklist.length > 0 && (
              <span className={cn('shrink-0 text-[10px] tabular-nums',
                checklistDone === taskChecklist.length ? 'text-green-500' : 'text-slate-400')}>
                ☑ {checklistDone}/{taskChecklist.length}
              </span>
            )}
            {openDeps.length > 0 && (
              <span
                title={`Blocked by: ${openDeps.map((d) => d.title).join(', ')}`}
                className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600"
              >
                <Link2 size={9} /> blocked
              </span>
            )}
            <AssigneeMenu
              members={members}
              assigneeId={task.assignee_id}
              onAssign={(id) => onUpdate(task.id, { assignee_id: id })}
            />
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto text-slate-300 transition-colors hover:text-slate-500"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          {/* Dates */}
          <div className="mt-0.5 flex items-center gap-0.5">
            <DateField
              value={task.start_date}
              onChange={(v) => onUpdate(task.id, { start_date: v })}
              placeholder="Start"
            />
            {(task.start_date || task.due_date) && (
              <span className="text-[10px] text-slate-200">–</span>
            )}
            <DateField
              value={task.due_date}
              onChange={(v) => onUpdate(task.id, { due_date: v })}
              placeholder="Due"
            />
          </div>

          {/* Expanded description + checklist */}
          {expanded && (
            <div className="mt-1.5 space-y-2">
              {task.description && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                  <pre className="whitespace-pre-wrap font-sans">{task.description}</pre>
                </div>
              )}
              {onAddChecklistItem && (
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <TaskChecklist
                    items={taskChecklist}
                    onAdd={(label) => onAddChecklistItem(task.id, label)}
                    onToggle={onToggleChecklistItem}
                    onDelete={onDeleteChecklistItem}
                  />
                </div>
              )}
              {allProjectTasks && (
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <DependencyPicker task={task} allProjectTasks={allProjectTasks} onUpdate={onUpdate} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEditTask && (
            <button
              type="button"
              title="Edit task"
              onClick={() => onEditTask(task)}
              className="rounded p-1 text-slate-300 transition-colors hover:text-blue-500"
            >
              <Pencil size={12} />
            </button>
          )}
          <MoveMenu
            label="Move to milestone"
            items={otherMilestones.map((m) => ({ id: m.id, name: m.name }))}
            onPick={(toMsId) => onMoveTask(task.id, toMsId)}
          />
          {onCloneTask && (
            <CloneMenu
              label="Copy task"
              onCloneHere={() => onCloneTask(task.id, task.milestone_id)}
              items={otherMilestones.map((m) => ({ id: m.id, name: m.name }))}
              onCloneTo={(toMsId) => onCloneTask(task.id, toMsId)}
            />
          )}
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            className="rounded p-1 text-slate-300 transition-colors hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Drag overlays ─────────────────────────────────────────────────────────────
function MilestoneGhost({ milestone }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 shadow-xl ring-1 ring-blue-200 opacity-90">
      <span className="text-sm font-semibold text-slate-700">{milestone.name}</span>
    </div>
  );
}
function TaskGhost({ task }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xl opacity-90">
      <span className="text-sm text-slate-700">{task.title}</span>
    </div>
  );
}

// ── SortableMilestoneBlock ────────────────────────────────────────────────────
function SortableMilestoneBlock({
  milestone,
  tasks,
  allProjectMilestones,
  techSections,
  onUpdateMilestone,
  onDeleteMilestone,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onCreateTask,
  onMoveMilestoneToSection,
  onCloneMilestone,
  onCloneTask,
  onEditTask,
  getPalette,
  members,
  checklistItems,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  allProjectTasks,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: milestone.id,
    data: { type: 'milestone' },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };

  const [collapsed, setCollapsed] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const done = tasks.filter((t) => t.status === 'done').length;
  const taskIds = tasks.map((t) => t.id);
  const otherSections = (techSections ?? []).filter((s) => s.id !== milestone.technology_id);

  return (
    <div ref={setNodeRef} style={style} className="mb-3">
      {/* Milestone header */}
      <div className="group flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          tabIndex={-1}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-slate-300 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-slate-600"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Milestone info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <InlineEdit
              value={milestone.name}
              onCommit={(v) => onUpdateMilestone(milestone.id, { name: v })}
              className="text-sm font-semibold text-slate-700"
            />
            <span className="text-xs text-slate-400 tabular-nums">{done}/{tasks.length}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-0.5">
            <DateField
              value={milestone.start_date}
              onChange={(v) => onUpdateMilestone(milestone.id, { start_date: v })}
              placeholder="Start date"
            />
            <span className="text-[10px] text-slate-200">–</span>
            <DateField
              value={milestone.due_date}
              onChange={(v) => onUpdateMilestone(milestone.id, { due_date: v })}
              placeholder="Due date"
            />
          </div>
        </div>

        {/* Header actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {otherSections.length > 0 && (
            <MoveMenu
              label="Move to section"
              items={otherSections.map((s) => ({ id: s.id, name: s.technology }))}
              onPick={(toId) => onMoveMilestoneToSection?.(milestone.id, toId)}
            />
          )}
          {onCloneMilestone && (
            <CloneMenu
              label="Clone phase"
              onCloneHere={() => onCloneMilestone(milestone.id, milestone.technology_id)}
              items={otherSections.map((s) => ({ id: s.id, name: s.technology }))}
              onCloneTo={(toId) => onCloneMilestone(milestone.id, toId)}
            />
          )}
          <button
            type="button"
            title="Delete phase"
            onClick={() => setConfirmState({
              title: 'Delete phase',
              message: `Delete phase "${milestone.name}"? Tasks will become unassigned.`,
              onConfirm: () => onDeleteMilestone(milestone.id),
            })}
            className="rounded p-1 text-slate-300 transition-colors hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Task list */}
      {!collapsed && (
        <div className="ml-4 mt-0.5 border-l-2 border-slate-100 pb-1 pl-3">
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                allProjectMilestones={allProjectMilestones}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onMoveTask={onMoveTask}
                onCloneTask={onCloneTask}
                onEditTask={onEditTask}
                getPalette={getPalette}
                members={members}
                checklistItems={checklistItems}
                onAddChecklistItem={onAddChecklistItem}
                onToggleChecklistItem={onToggleChecklistItem}
                onDeleteChecklistItem={onDeleteChecklistItem}
                allProjectTasks={allProjectTasks}
              />
            ))}
          </SortableContext>
          <AddInline
            placeholder="Add task"
            onAdd={(title) => onCreateTask({ milestone_id: milestone.id, title })}
          />
        </div>
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TaskSection({
  milestones,
  tasks,
  allProjectMilestones,
  techSections,
  onCreateMilestone,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateMilestone,
  onDeleteMilestone,
  onBatchUpdateMilestones,
  onBatchUpdateTasks,
  onMoveMilestoneToSection,
  onCloneMilestone,
  onCloneTask,
  onEditTask,
  getPalette,
  members,
  checklistItems,
  onCreateChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  allProjectTasks,
  showDependencies = true,
}) {
  const [activeId, setActiveId] = useState(null);
  const [activeType, setActiveType] = useState(null);

  // Dependencies off (module variant): rows get no task pool, which hides
  // the picker AND the blocked-by badges in one stroke.
  const depTasks = showDependencies ? allProjectTasks : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const milestoneIds = milestones.map((m) => m.id);
  const ungroupedTasks = tasks.filter((t) => !t.milestone_id);

  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
    setActiveType(active.data.current?.type ?? null);
  };
  const handleDragCancel = () => { setActiveId(null); setActiveType(null); };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    setActiveType(null);
    if (!over || active.id === over.id) return;

    const overType = over.data.current?.type;

    // Milestone reorder
    if (activeType === 'milestone') {
      const oldIdx = milestones.findIndex((m) => m.id === active.id);
      const newIdx = milestones.findIndex((m) => m.id === over.id);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const reordered = arrayMove(milestones, oldIdx, newIdx);
      onBatchUpdateMilestones?.(reordered.map((m, i) => ({ id: m.id, sort_order: i * 10 })));
      return;
    }

    // Task reorder / cross-milestone
    if (activeType === 'task') {
      const activeTask = tasks.find((t) => t.id === active.id);
      if (!activeTask) return;

      let toMilestoneId = activeTask.milestone_id;
      if (overType === 'milestone') toMilestoneId = over.id;
      else if (overType === 'task') toMilestoneId = over.data.current?.milestoneId ?? activeTask.milestone_id;

      if (toMilestoneId === activeTask.milestone_id) {
        // Same milestone — reorder
        const sameTasks = tasks.filter((t) => t.milestone_id === toMilestoneId);
        const oldIdx = sameTasks.findIndex((t) => t.id === active.id);
        const newIdx = sameTasks.findIndex((t) => t.id === over.id);
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
        const reordered = arrayMove(sameTasks, oldIdx, newIdx);
        onBatchUpdateTasks?.(reordered.map((t, i) => ({ id: t.id, sort_order: i * 10 })));
      } else {
        // Cross-milestone — append to target
        const toMs = (allProjectMilestones ?? milestones).find((m) => m.id === toMilestoneId);
        const targetTasks = tasks.filter((t) => t.milestone_id === toMilestoneId);
        onBatchUpdateTasks?.([{
          id: active.id,
          milestone_id: toMilestoneId,
          technology_id: toMs?.technology_id ?? null,
          sort_order: targetTasks.length * 10,
        }]);
      }
    }
  };

  const handleMoveTask = (taskId, toMilestoneId) => {
    const toMs = (allProjectMilestones ?? milestones).find((m) => m.id === toMilestoneId);
    const targetTasks = tasks.filter((t) => t.milestone_id === toMilestoneId);
    onBatchUpdateTasks?.([{
      id: taskId,
      milestone_id: toMilestoneId,
      technology_id: toMs?.technology_id ?? null,
      sort_order: targetTasks.length * 10,
    }]);
  };

  const activeMilestone = activeId ? milestones.find((m) => m.id === activeId) : null;
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        <SortableContext items={milestoneIds} strategy={verticalListSortingStrategy}>
          {milestones.map((milestone) => {
            const mTasks = tasks
              .filter((t) => t.milestone_id === milestone.id)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            return (
              <SortableMilestoneBlock
                key={milestone.id}
                milestone={milestone}
                tasks={mTasks}
                allProjectMilestones={allProjectMilestones}
                techSections={techSections}
                onUpdateMilestone={onUpdateMilestone}
                onDeleteMilestone={onDeleteMilestone}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onMoveTask={handleMoveTask}
                onCreateTask={onCreateTask}
                onMoveMilestoneToSection={onMoveMilestoneToSection}
                onCloneMilestone={onCloneMilestone}
                onCloneTask={onCloneTask}
                onEditTask={onEditTask}
                getPalette={getPalette}
                members={members}
                checklistItems={checklistItems}
                onAddChecklistItem={onCreateChecklistItem}
                onToggleChecklistItem={onToggleChecklistItem}
                onDeleteChecklistItem={onDeleteChecklistItem}
                allProjectTasks={depTasks}
              />
            );
          })}
        </SortableContext>

        {/* Ungrouped tasks (no milestone assigned) */}
        {ungroupedTasks.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-3">
            <p className="mb-1.5 text-xs font-medium text-slate-400">Ungrouped Tasks</p>
            <SortableContext
              items={ungroupedTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {ungroupedTasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  allProjectMilestones={allProjectMilestones}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  onMoveTask={handleMoveTask}
                  onCloneTask={onCloneTask}
                  onEditTask={onEditTask}
                  getPalette={getPalette}
                  members={members}
                  checklistItems={checklistItems}
                  onAddChecklistItem={onCreateChecklistItem}
                  onToggleChecklistItem={onToggleChecklistItem}
                  onDeleteChecklistItem={onDeleteChecklistItem}
                  allProjectTasks={depTasks}
                />
              ))}
            </SortableContext>
          </div>
        )}

        <div className="mt-2">
          <AddInline
            placeholder="Add phase / milestone"
            onAdd={(name) => onCreateMilestone({ name })}
          />
        </div>
      </div>

      <DragOverlay>
        {activeMilestone && <MilestoneGhost milestone={activeMilestone} />}
        {activeTask && <TaskGhost task={activeTask} />}
      </DragOverlay>
    </DndContext>
  );
}
