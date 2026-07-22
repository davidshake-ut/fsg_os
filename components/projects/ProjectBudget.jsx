'use client';

import { DollarSign, Clock, TrendingDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

function fmt(n) {
  return n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Row({ label, value, sub, highlight, tone }) {
  return (
    <div className={cn('flex items-center justify-between py-3', highlight && 'font-semibold')}>
      <span className={cn('text-sm', highlight ? 'text-slate-900' : 'text-slate-600')}>{label}</span>
      <span className={cn('text-sm tabular-nums', tone === 'danger' ? 'text-red-600' : highlight ? 'text-slate-900' : 'text-slate-700')}>
        {value}
        {sub && <span className="ml-1 text-xs text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}

export default function ProjectBudget({ project, tasks, timeEntries, showSplit = true }) {
  const budget = project?.budget ? parseFloat(project.budget) : null;
  const quoteName = project?.saved_projects?.project_name;
  const quoteId = project?.quote_id;

  const totalHours = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  // Actual cost/billable value from time-entry rates. Rates are captured
  // per-entry (no user/role rate table exists), so entries logged before a
  // rate was ever set just contribute $0 — surfaced below as a coverage note
  // rather than silently presented as a complete number.
  const ratedEntries = timeEntries.filter((e) => e.cost_rate != null);
  const actualCost = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0) * (parseFloat(e.cost_rate) || 0), 0);
  const billableValue = timeEntries
    .filter((e) => e.billable !== false)
    .reduce((sum, e) => sum + (parseFloat(e.hours) || 0) * (parseFloat(e.bill_rate) || 0), 0);
  const hasFullCostCoverage = timeEntries.length > 0 && ratedEntries.length === timeEntries.length;

  const tasksDone  = tasks.filter((t) => t.status === 'done').length;
  const tasksTotal = tasks.length;
  const pctTasks   = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  const remaining = budget != null ? budget - actualCost : null;

  return (
    <div className="space-y-4">
      {/* Budget card */}
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <DollarSign size={15} /> Budget
        </h3>

        {quoteId && quoteName && (
          <Link
            href={`/builder?project=${quoteId}`}
            className="mb-3 flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink size={12} /> Linked quote: {quoteName}
          </Link>
        )}

        <div className="divide-y divide-slate-100">
          <Row label="Project Budget"  value={fmt(budget)}  highlight />
          {showSplit && project?.equipment_budget != null && (
            <Row label="· Equipment" value={fmt(parseFloat(project.equipment_budget))} sub="(purchase orders)" />
          )}
          {showSplit && project?.labor_budget != null && (
            <Row label="· Labor" value={fmt(parseFloat(project.labor_budget))} sub="(time tracking)" />
          )}
          <Row
            label="Budget Consumed"
            value={timeEntries.length === 0 ? '—' : fmt(actualCost)}
            sub={timeEntries.length > 0 && !hasFullCostCoverage ? `(${ratedEntries.length}/${timeEntries.length} entries rated)` : undefined}
          />
          <Row
            label="Remaining"
            value={remaining == null ? '—' : fmt(remaining)}
            highlight
            tone={remaining != null && remaining < 0 ? 'danger' : undefined}
          />
        </div>
        {remaining != null && remaining < 0 && (
          <p className="mt-2 text-xs font-medium text-red-600">Over budget by {fmt(Math.abs(remaining))}.</p>
        )}
      </Card>

      {/* Hours card */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Clock size={15} /> Time Tracking
        </h3>
        <div className="divide-y divide-slate-100">
          <Row label="Hours Logged" value={`${totalHours.toFixed(1)}h`} highlight />
          <Row label="Entries"      value={timeEntries.length} />
          <Row label="Billable Value" value={billableValue > 0 ? fmt(billableValue) : '—'} />
        </div>
      </Card>

      {/* Task progress card */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <TrendingDown size={15} /> Task Progress
        </h3>

        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{tasksDone} of {tasksTotal} tasks done</span>
            <span className="font-medium">{pctTasks}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full [background:var(--ui-button-bg,var(--brand,#2563eb))] transition-all"
              style={{ width: `${pctTasks}%` }}
            />
          </div>
        </div>

        {tasks.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span>{tasks.filter((t) => t.status === 'todo').length} to-do</span>
            <span>{tasks.filter((t) => t.status === 'in_progress').length} in progress</span>
            <span className="text-emerald-600">{tasksDone} done</span>
          </div>
        )}
      </Card>
    </div>
  );
}
