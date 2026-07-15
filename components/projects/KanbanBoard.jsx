'use client';

// Drag tasks between status columns. Deliberately does NOT support reordering
// within a column — sort_order is scoped per-milestone and driven by the
// Tasks tab; touching it here would scramble that ordering. This board only
// ever changes `status`.

import { useState } from 'react';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CheckSquare, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_STATUS_CONFIG, taskStatusClasses } from './ProjectStatusBadge';

const COLUMNS = ['todo', 'in_progress', 'done'];

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name, email) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (email || '?')[0].toUpperCase();
}

function TaskCard({ task, milestoneName, assignee, checklistDone, checklistTotal, getPalette, hidden }) {
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

function Column({ status, tasks, milestoneNameOf, memberOf, checklistCountsOf, getPalette, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const cfg = TASK_STATUS_CONFIG[status];

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', taskStatusClasses(status))}>{cfg.label}</span>
        <span className="text-xs tabular-nums text-slate-400">{tasks.length}</span>
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
            />
          );
        })}
        {tasks.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-300">No tasks</p>}
      </div>
    </div>
  );
}

export default function KanbanBoard({ tasks, milestones, members, checklistItems, getPalette, onUpdateTask }) {
  const [activeId, setActiveId] = useState(null);
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

  const columns = COLUMNS.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));

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
        {columns.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            tasks={col.tasks}
            milestoneNameOf={milestoneNameOf}
            memberOf={memberOf}
            checklistCountsOf={checklistCountsOf}
            getPalette={getPalette}
            activeId={activeId}
          />
        ))}
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
