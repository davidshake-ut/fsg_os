'use client';

// Drag accounts between pipeline stages. Same interaction pattern as
// components/projects/KanbanBoard.jsx (plain useDraggable/useDroppable, no
// within-column reordering needed here either).

import { useState } from 'react';
import Link from 'next/link';
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { Calendar, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { currency } from '@/lib/format';
import { toneClasses } from '@/lib/statusColors';

export const STAGES = [
  { id: 'new',         label: 'New',         tone: 'neutral'  },
  { id: 'qualifying',  label: 'Qualifying',  tone: 'info'     },
  { id: 'proposal',    label: 'Proposal',    tone: 'progress' },
  { id: 'negotiation', label: 'Negotiation', tone: 'warning'  },
  { id: 'won',         label: 'Won',         tone: 'success'  },
  { id: 'lost',        label: 'Lost',        tone: 'danger'   },
];

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AccountCard({ account, hidden }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: account.id });
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
        'cursor-grab touch-none rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow active:cursor-grabbing',
        isDragging && 'opacity-40',
        hidden && 'invisible'
      )}
    >
      <Link href={`/crm/${account.id}`} className="block p-2.5">
        <p className="truncate text-sm font-medium text-slate-700">{account.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          {account.deal_value != null && (
            <span className="font-medium text-slate-600">{currency(account.deal_value)}</span>
          )}
          {account.probability != null && (
            <span className="flex items-center gap-0.5"><Percent size={9} /> {account.probability}</span>
          )}
          {account.expected_close_date && (
            <span className="flex items-center gap-0.5"><Calendar size={9} /> {fmtDate(account.expected_close_date)}</span>
          )}
        </div>
      </Link>
    </div>
  );
}

function Column({ stage, accounts, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = accounts.reduce((s, a) => s + (Number(a.deal_value) || 0), 0);

  return (
    <div className="flex min-w-[220px] flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', toneClasses(stage.tone, { border: false }))}>{stage.label}</span>
        <span className="text-xs tabular-nums text-slate-400">{accounts.length}</span>
        {totalValue > 0 && <span className="ml-auto text-[10px] tabular-nums text-slate-400">{currency(totalValue)}</span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-2 transition-colors',
          isOver ? 'border-blue-300 bg-blue-50/40' : 'border-transparent bg-slate-50/60'
        )}
      >
        {accounts.map((a) => <AccountCard key={a.id} account={a} hidden={a.id === activeId} />)}
        {accounts.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-300">Empty</p>}
      </div>
    </div>
  );
}

export default function PipelineBoard({ accounts, onUpdateAccount }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const columns = STAGES.map((stage) => ({
    stage,
    accounts: accounts.filter((a) => (a.stage ?? 'new') === stage.id),
  }));

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const account = accounts.find((a) => a.id === active.id);
    if (!account || (account.stage ?? 'new') === over.id) return;
    onUpdateAccount(account.id, { stage: over.id });
  };

  const activeAccount = activeId ? accounts.find((a) => a.id === activeId) : null;
  const weightedTotal = accounts
    .filter((a) => a.stage !== 'won' && a.stage !== 'lost')
    .reduce((s, a) => s + (Number(a.deal_value) || 0) * ((Number(a.probability) || 0) / 100), 0);

  return (
    <div>
      {weightedTotal > 0 && (
        <p className="mb-3 text-xs text-slate-400">
          Weighted open pipeline: <span className="font-medium text-slate-600">{currency(weightedTotal)}</span>
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <Column key={col.stage.id} stage={col.stage} accounts={col.accounts} activeId={activeId} />
          ))}
        </div>
        <DragOverlay>
          {activeAccount && (
            <div className="w-56 rounded-lg border border-blue-300 bg-white p-2.5 shadow-xl">
              <p className="text-sm text-slate-700">{activeAccount.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
