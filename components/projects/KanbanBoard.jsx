'use client';

// Drag tasks between status columns. Deliberately does NOT support reordering
// within a column — sort_order is scoped per-milestone and driven by the
// Tasks tab; touching it here would scramble that ordering. This board
// changes `status`, and (for writers) the project's column set itself:
// rename any column, add custom ones, delete non-anchor columns (their
// tasks move to To Do). 'todo' and 'done' are permanent anchors — see
// lib/boardColumns.js. Clicking a card opens the shared Edit Task dialog
// (the PointerSensor's 5px activation keeps clicks distinct from drags).

import { useState } from 'react';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CheckSquare, Calendar, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { taskStatusClasses } from './ProjectStatusBadge';
import { DEFAULT_BOARD_COLUMNS, SYSTEM_COLUMN_IDS, newColumnId } from '@/lib/boardColumns';

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (email || '?')[0].toUpperCase();
}

function TaskCard({ task, milestoneName, assignee, checklistDone, checklistTotal, getPalette, hidden, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit?.(task)}
      title="Click to edit task"
      className={cn(
        'cursor-grab touch-none rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow active:cursor-grabbing',
        isDragging && 'opacity-40',
        hidden && 'invisible'
      )}
    >
      {milestoneName && (
        <p className="mb-1 truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">{milestoneName}</p>
      )}
      <p className="text-sm text-slate-700">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.role && (() => {
          const p = getPalette ? getPalette(task.role) : { badge: 'bg-blue-50 text-blue-600' };
          return <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', p.badge)}>{task.role}</span>;
        })()}
        {checklistTotal > 0 && (
          <span className={cn('flex items-center gap-0.5 text-[10px]', checklistDone === checklistTotal ? 'text-green-500' : 'text-slate-400')}>
            <CheckSquare size={10} /> {checklistDone}/{checklistTotal}
          </span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
            <Calendar size={10} /> {fmtDate(task.due_date)}
          </span>
        )}
        {assignee && (
          <span className="ml-auto flex min-w-0 items-center gap-1" title={assignee.full_name || assignee.email}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-semibold text-blue-700">
              {initials(assignee.full_name, assignee.email)}
            </span>
            <span className="max-w-[90px] truncate text-[10px] text-slate-500">
              {(assignee.full_name || assignee.email || '').split(' ')[0]}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ column, tasks, milestoneNameOf, memberOf, checklistCountsOf, getPalette, activeId, onEditTask, onRename, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSystem = SYSTEM_COLUMN_IDS.has(column.id);

  const commitRename = () => {
    const next = name.trim();
    if (next && next !== column.label) onRename(next);
    setRenaming(false);
  };

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div className="group/col mb-2 flex items-center gap-2 px-1">
        {renaming ? (
          <span className="flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setName(column.label); setRenaming(false); }
              }}
              className="h-6 w-32 rounded border border-slate-200 px-1.5 text-xs outline-none focus:border-blue-400"
              autoFocus
            />
            <button type="button" onClick={commitRename} className="text-emerald-600"><Check size={12} /></button>
            <button type="button" onClick={() => { setName(column.label); setRenaming(false); }} className="text-slate-400"><X size={12} /></button>
          </span>
        ) : (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', taskStatusClasses(column.id))}>{column.label}</span>
        )}
        <span className="text-xs tabular-nums text-slate-400">{tasks.length}</span>
        {onRename && !renaming && (
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/col:opacity-100">
            <button type="button" title="Rename column" onClick={() => { setName(column.label); setRenaming(true); }}
              className="rounded p-0.5 text-slate-300 hover:text-blue-500">
              <Pencil size={11} />
            </button>
            {!isSystem && onDelete && (
              confirmDelete ? (
                <span className="flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">
                  {tasks.length > 0 ? `Move ${tasks.length} to To Do?` : 'Delete?'}
                  <button type="button" onClick={() => { setConfirmDelete(false); onDelete(); }} className="font-semibold hover:underline">Yes</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-red-400 hover:underline">No</button>
                </span>
              ) : (
                <button type="button" title="Delete column" onClick={() => setConfirmDelete(true)}
                  className="rounded p-0.5 text-slate-300 hover:text-red-500">
                  <Trash2 size={11} />
                </button>
              )
            )}
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-2 transition-colors',
          isOver ? 'border-blue-300 bg-blue-50/40' : 'border-transparent bg-slate-50/60'
        )}
      >
        {tasks.map((task) => {
          const [done, total] = checklistCountsOf(task.id);
          return (
            <TaskCard
              key={task.id}
              task={task}
              milestoneName={milestoneNameOf(task.milestone_id)}
              assignee={memberOf(task.assignee_id)}
              checklistDone={done}
              checklistTotal={total}
              getPalette={getPalette}
              hidden={task.id === activeId}
              onEdit={onEditTask}
            />
          );
        })}
        {tasks.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-300">No tasks</p>}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  tasks,
  milestones,
  members,
  checklistItems,
  getPalette,
  onUpdateTask,
  columns: columnDefs = DEFAULT_BOARD_COLUMNS,
  onUpdateColumns, // (list) => void — absent for read-only viewers
  onEditTask,
}) {
  const [activeId, setActiveId] = useState(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const milestoneNameOf = (id) => milestones.find((m) => m.id === id)?.name ?? null;
  const memberOf = (id) => (members ?? []).find((m) => m.id === id) ?? null;
  const checklistCountsOf = (taskId) => {
    const items = (checklistItems ?? []).filter((c) => c.task_id === taskId);
    return [items.filter((c) => c.is_done).length, items.length];
  };

  // Tasks whose column was deleted out from under them surface in To Do.
  // Within a column, cards read chronologically like the Gantt: earliest
  // start first (due date stands in when start is missing), undated tasks
  // last, schedule order as the tie-break.
  const knownIds = new Set(columnDefs.map((c) => c.id));
  const timeKey = (t) => t.start_date ?? t.due_date ?? '9999-12-31';
  const columns = columnDefs.map((col) => ({
    col,
    tasks: tasks
      .filter((t) => t.status === col.id || (col.id === 'todo' && !knownIds.has(t.status)))
      .sort(
        (a, b) =>
          timeKey(a).localeCompare(timeKey(b)) ||
          (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
  }));

  const renameColumn = (id, label) =>
    onUpdateColumns?.(columnDefs.map((c) => (c.id === id ? { ...c, label } : c)));
  const deleteColumn = async (col) => {
    const orphans = tasks.filter((t) => t.status === col.id);
    for (const t of orphans) await onUpdateTask(t.id, { status: 'todo' });
    onUpdateColumns?.(columnDefs.filter((c) => c.id !== col.id));
  };
  const addColumn = () => {
    const label = newColumnLabel.trim();
    if (!label) return;
    // New columns slot before Done — a fresh stage is part of the flow, not
    // after completion.
    const doneIdx = columnDefs.findIndex((c) => c.id === 'done');
    const next = [...columnDefs];
    next.splice(doneIdx === -1 ? next.length : doneIdx, 0, { id: newColumnId(), label });
    onUpdateColumns?.(next);
    setNewColumnLabel('');
    setAddingColumn(false);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === over.id) return;
    onUpdateTask(task.id, { status: over.id });
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map(({ col, tasks: colTasks }) => (
          <Column
            key={col.id}
            column={col}
            tasks={colTasks}
            milestoneNameOf={milestoneNameOf}
            memberOf={memberOf}
            checklistCountsOf={checklistCountsOf}
            getPalette={getPalette}
            activeId={activeId}
            onEditTask={onEditTask}
            onRename={onUpdateColumns ? (label) => renameColumn(col.id, label) : undefined}
            onDelete={onUpdateColumns ? () => deleteColumn(col) : undefined}
          />
        ))}
        {onUpdateColumns && (
          <div className="w-40 shrink-0 pt-0.5">
            {addingColumn ? (
              <div className="flex items-center gap-1">
                <input
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addColumn();
                    if (e.key === 'Escape') { setAddingColumn(false); setNewColumnLabel(''); }
                  }}
                  placeholder="Column name"
                  className="h-7 w-full rounded border border-slate-200 px-2 text-xs outline-none focus:border-blue-400"
                  autoFocus
                />
                <button type="button" onClick={addColumn} className="text-emerald-600"><Check size={13} /></button>
                <button type="button" onClick={() => { setAddingColumn(false); setNewColumnLabel(''); }} className="text-slate-400"><X size={13} /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-500"
              >
                <Plus size={12} /> Add column
              </button>
            )}
          </div>
        )}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="w-64 rounded-lg border border-blue-300 bg-white p-2.5 shadow-xl">
            <p className="text-sm text-slate-700">{activeTask.title}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
