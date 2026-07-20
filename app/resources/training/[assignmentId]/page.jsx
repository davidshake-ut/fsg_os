'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, BookOpen, FileText, Link2,
  Calendar, Clock, Check, ExternalLink, PartyPopper,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useTrainingAssignment, openCourseItem } from '@/hooks/useTraining';
import TrainingStatusBadge from '@/components/training/TrainingStatusBadge';
import ProjectProgressBar from '@/components/projects/ProjectProgressBar';
import AppToast from '@/components/ui/AppToast';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';
import { courseProgress, displayStatus, isOverdue, todayStr } from '@/lib/training';

const ITEM_TYPE_META = {
  kb_article:   { label: 'Knowledge Base', icon: BookOpen },
  resource:     { label: 'Resource',       icon: FileText },
  external_url: { label: 'Link',           icon: Link2 },
};

function CourseItemRow({ item, done, own, busy, onOpen, onToggle }) {
  const meta = ITEM_TYPE_META[item.item_type] ?? ITEM_TYPE_META.resource;
  const Icon = meta.icon;
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', done && 'bg-emerald-50/40')}>
      {/* Completion toggle — only on the learner's own assignment */}
      <button
        type="button"
        disabled={!own || busy}
        onClick={onToggle}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent hover:border-emerald-400',
          (!own || busy) && 'cursor-default opacity-60'
        )}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <button type="button" onClick={onOpen} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Icon size={15} className="text-slate-500" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium text-slate-800 group-hover:text-blue-700', done && 'text-slate-500')}>
            {item.title}
          </span>
          <span className="text-[11px] text-slate-400">
            {meta.label}
            {item.description && <> · {item.description}</>}
          </span>
        </span>
        <ExternalLink size={13} className="shrink-0 text-slate-300 group-hover:text-blue-500" />
      </button>
    </div>
  );
}

function CourseDetail() {
  const { assignmentId } = useParams();
  const { session, company, user } = useSession();
  const { assignment, items, completions, loading, loadError, setItemDone } =
    useTrainingAssignment(assignmentId, session, company, user);
  const [busyItem, setBusyItem] = useState(null);
  const [toast, setToast] = useState(null);
  const today = todayStr();

  if (loading) {
    return <div className="flex h-64 items-center justify-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={18} /> Loading…</div>;
  }
  if (loadError || !assignment) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle size={28} className="text-slate-300" />
        <p className="text-sm">Course assignment not found.</p>
        <Link href="/resources/training" className="text-sm text-blue-600 hover:underline">← Back to Training</Link>
      </div>
    );
  }

  const course = assignment.training_courses;
  const own = assignment.user_id === user?.id;
  const doneIds = new Set(completions.map((c) => c.course_item_id));
  const doneCount = items.filter((i) => doneIds.has(i.id)).length;
  const pct = courseProgress(doneCount, items.length);
  const status = displayStatus(assignment, today);

  const handleToggle = async (item) => {
    const marking = !doneIds.has(item.id);
    setBusyItem(item.id);
    try {
      await setItemDone(item.id, marking);
      if (marking && doneCount + 1 >= items.length && items.length > 0) {
        setToast({ type: 'success', message: `Course complete — nice work! 🎉` });
      } else if (marking) {
        setToast({ type: 'success', message: 'Item marked complete.' });
      }
    } catch (ex) {
      setToast({ type: 'error', message: ex.message });
    } finally {
      setBusyItem(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/resources/training" className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> My Training
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">{course?.title ?? 'Course'}</h1>
            {course?.description && <p className="mt-1 text-sm text-slate-500">{course.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {course?.estimated_minutes && <span className="flex items-center gap-1"><Clock size={12} /> ~{course.estimated_minutes} min</span>}
              {assignment.due_date && (
                <span className={cn('flex items-center gap-1', isOverdue(assignment, today) && 'font-semibold text-rose-500')}>
                  <Calendar size={12} /> Due {fmtDate(assignment.due_date)}
                </span>
              )}
              <span>Assigned {fmtDate(assignment.assigned_at)}</span>
            </div>
          </div>
          <TrainingStatusBadge status={status} className="shrink-0" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ProjectProgressBar pct={pct} className="h-2 flex-1" />
          <span className="shrink-0 text-xs font-bold tabular-nums text-slate-600">
            {doneCount}/{items.length} · {pct}%
          </span>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {assignment.status === 'completed' && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <PartyPopper size={18} className="shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                <b>Course completed</b>{assignment.completed_at && <> on {fmtDate(assignment.completed_at)}</>}.
                {assignment.completion_note && <> Note: {assignment.completion_note}</>}
              </p>
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
              This course doesn&apos;t have any content yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
              {items.map((item) => (
                <CourseItemRow
                  key={item.id}
                  item={item}
                  done={doneIds.has(item.id)}
                  own={own}
                  busy={busyItem === item.id}
                  onOpen={() => openCourseItem(item)}
                  onToggle={() => handleToggle(item)}
                />
              ))}
            </div>
          )}

          {own && items.length > 0 && assignment.status !== 'completed' && (
            <p className="text-center text-xs text-slate-400">
              Open each item, then tap the circle to mark it complete.
            </p>
          )}
        </div>
      </div>
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function TrainingAssignmentPage() {
  return <AuthGuard><OSShell><CourseDetail /></OSShell></AuthGuard>;
}
