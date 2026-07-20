'use client';

// Assign-training flow: pick a published course, choose people (individuals,
// a role, or everyone), set an optional due date, review exactly what will
// be created vs. skipped, confirm. Duplicate-safe — the preview mirrors the
// DB's (course_id, user_id) unique constraint.

import { useEffect, useMemo, useState } from 'react';
import { X, Users, Check, SkipForward } from 'lucide-react';
import { Button, Field, TextInput, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { resolveAssignmentTargets, partitionAssignmentPreview } from '@/lib/training';

const ROLE_LABELS = { user: 'Members', company_admin: 'Admins' };

export default function AssignCourseModal({ open, courses, members, assignments, presetCourseId = null, onAssign, onClose }) {
  const [courseId, setCourseId] = useState('');
  const [userIds, setUserIds] = useState([]);
  const [roles, setRoles] = useState([]);
  const [everyone, setEveryone] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setCourseId(presetCourseId ?? '');
      setUserIds([]); setRoles([]); setEveryone(false); setDueDate(''); setErr(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open, presetCourseId]);

  const published = courses.filter((c) => c.status === 'published');
  const course = published.find((c) => c.id === courseId) ?? null;

  const targets = useMemo(
    () => resolveAssignmentTargets(members, { userIds, roles, everyone }),
    [members, userIds, roles, everyone]
  );
  const existing = useMemo(
    () => assignments.filter((a) => a.course_id === courseId),
    [assignments, courseId]
  );
  const { toCreate, alreadyAssigned, alreadyCompleted } = useMemo(
    () => partitionAssignmentPreview(targets, existing),
    [targets, existing]
  );

  if (!open) return null;

  const toggleUser = (id) => setUserIds((l) => l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const toggleRole = (r) => setRoles((l) => l.includes(r) ? l.filter((x) => x !== r) : [...l, r]);

  const submit = async () => {
    if (!course) { setErr('Choose a published course.'); return; }
    if (toCreate.length === 0) { setErr('Everyone selected already has this course.'); return; }
    setSaving(true); setErr(null);
    try {
      await onAssign(course, toCreate, dueDate || null);
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const selectable = members.filter((m) => m.role !== 'viewer');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Assign Training">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Assign Training</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <Field label="Course *">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">— choose a published course —</option>
              {published.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
            {published.length === 0 && <p className="mt-1 text-xs text-amber-600">No published courses yet — publish a course first.</p>}
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Assign to</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setEveryone((v) => !v)}
                className={cn('flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  everyone ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                <Users size={12} /> Everyone
              </button>
              {Object.entries(ROLE_LABELS).map(([r, label]) => (
                <button key={r} type="button" onClick={() => toggleRole(r)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-all',
                    roles.includes(r) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
                  All {label}
                </button>
              ))}
            </div>
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
              {selectable.map((m) => {
                const inTargets = targets.some((t) => t.user.id === m.id);
                const checked = userIds.includes(m.id);
                return (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" checked={checked} onChange={() => toggleUser(m.id)}
                      className="h-4 w-4 accent-blue-600" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{m.full_name || m.email}</span>
                    {!checked && inTargets && <span className="shrink-0 text-[10px] font-medium text-blue-500">included</span>}
                  </label>
                );
              })}
              {selectable.length === 0 && <p className="py-3 text-center text-xs text-slate-400">No members found.</p>}
            </div>
          </div>

          <Field label="Due date (optional)">
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>

          {/* Review */}
          {course && targets.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <p className="flex items-center justify-between text-slate-600">
                <span>Selected</span><b className="tabular-nums">{targets.length}</b>
              </p>
              <p className="flex items-center justify-between text-emerald-700">
                <span className="flex items-center gap-1"><Check size={13} /> New assignments</span>
                <b className="tabular-nums">{toCreate.length}</b>
              </p>
              {alreadyAssigned.length > 0 && (
                <p className="flex items-center justify-between text-slate-500">
                  <span className="flex items-center gap-1"><SkipForward size={13} /> Already assigned — skipped</span>
                  <b className="tabular-nums">{alreadyAssigned.length}</b>
                </p>
              )}
              {alreadyCompleted.length > 0 && (
                <p className="flex items-center justify-between text-slate-500">
                  <span className="flex items-center gap-1"><SkipForward size={13} /> Already completed — skipped</span>
                  <b className="tabular-nums">{alreadyCompleted.length}</b>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || !course || toCreate.length === 0} onClick={submit}>
            {saving ? 'Assigning…' : `Assign to ${toCreate.length} member${toCreate.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
