'use client';

// Admin tabs for Resources > Training: Courses, Assignments, Certifications,
// and the Training Dashboard. All four render inside the training page and
// share one useTrainingAdmin instance (passed as `admin`). The page owns the
// ConfirmModal and toast — tabs ask for them via onConfirm / onToast.

import { useMemo, useState } from 'react';
import {
  Search, Plus, Pencil, Copy, Trash2, Archive, Send, Undo2, Inbox,
  CheckCircle2, RotateCcw, CalendarClock, Download, ExternalLink, Award,
  GraduationCap, AlertCircle, X,
} from 'lucide-react';
import TrainingStatusBadge, { CertStatusBadge, ASSIGNMENT_STATUS_CONFIG } from '@/components/training/TrainingStatusBadge';
import ProjectProgressBar from '@/components/projects/ProjectProgressBar';
import { Card, Button, Select, StatusBadge } from '@/components/ui/primitives';
import { openStoredFile, PROOF_BUCKET } from '@/hooks/useTraining';
import { exportRowsCSV } from '@/lib/exportCSV';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';
import {
  courseProgress, displayStatus, isOverdue, todayStr,
  certStatus, certDaysUntilExpiry, compareCerts,
} from '@/lib/training';

const COURSE_STATUS = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived:  { label: 'Archived',  tone: 'warning' },
};

const memberName = (m) => m?.full_name || m?.email || '—';

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative flex-1">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
    </div>
  );
}

function SectionHead({ title, onExport }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <Button size="sm" variant="outline" onClick={onExport}><Download size={13} /> CSV</Button>
    </div>
  );
}

function IconAction({ icon: Icon, title, danger, onClick }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cn('rounded-lg p-1.5 text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-600',
        danger && 'hover:bg-red-50 hover:text-red-500')}>
      <Icon size={14} />
    </button>
  );
}

// ── Courses tab ───────────────────────────────────────────────────────────
export function AdminCourses({ admin, onEditCourse, onNewCourse, onAssignCourse, onConfirm, onToast }) {
  const { courses, itemsByCourse, assignments, members } = admin;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const q = search.trim().toLowerCase();
  const filtered = courses.filter((c) =>
    (statusFilter === 'all' || c.status === statusFilter)
    && (!q || c.title.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q)));

  const statsFor = (course) => {
    const rows = assignments.filter((a) => a.course_id === course.id);
    const completed = rows.filter((a) => a.status === 'completed').length;
    return {
      active: rows.length,
      rate: rows.length ? Math.round((completed / rows.length) * 100) : null,
    };
  };

  const act = async (fn, success) => {
    try { await fn(); if (success) onToast({ type: 'success', message: success }); }
    catch (ex) { onToast({ type: 'error', message: ex.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search courses…" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 sm:w-36">
          <option value="all">All statuses</option>
          {Object.entries(COURSE_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </Select>
        <Button size="sm" onClick={onNewCourse}><Plus size={14} /> New Course</Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <GraduationCap size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{q || statusFilter !== 'all' ? 'No courses match' : 'No courses yet'}</p>
          {!q && statusFilter === 'all' && (
            <Button size="sm" className="mt-4" onClick={onNewCourse}><Plus size={14} /> Create your first course</Button>
          )}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Course', 'Status', 'Items', 'Assigned', 'Completion', 'Updated', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const items = itemsByCourse.get(c.id) ?? [];
                const s = statsFor(c);
                const creator = members.find((m) => m.id === c.created_by);
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onEditCourse(c)} className="text-left">
                        <span className="block text-sm font-medium text-slate-900 hover:text-blue-700">{c.title}</span>
                        <span className="text-xs text-slate-400">{c.category}{creator && <> · by {memberName(creator)}</>}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3"><StatusBadge tone={COURSE_STATUS[c.status]?.tone ?? 'neutral'}>{COURSE_STATUS[c.status]?.label ?? c.status}</StatusBadge></td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-600">{items.length}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-600">{s.active}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-600">{s.rate == null ? '—' : `${s.rate}%`}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{fmtDate(c.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {c.status === 'published' && (
                          <IconAction icon={Send} title="Assign this course" onClick={() => onAssignCourse(c)} />
                        )}
                        <IconAction icon={Pencil} title="Edit" onClick={() => onEditCourse(c)} />
                        <IconAction icon={Copy} title="Duplicate" onClick={() => act(() => admin.duplicateCourse(c), 'Course duplicated as draft.')} />
                        {c.status === 'draft' && items.length > 0 && (
                          <IconAction icon={Send} title="Publish" onClick={() => act(() => admin.setCourseStatus(c, 'published'), 'Course published.')} />
                        )}
                        {c.status === 'published' && (
                          <IconAction icon={Undo2} title="Return to draft"
                            onClick={() => onConfirm('Return to draft',
                              `Unpublish "${c.title}"? It can no longer be assigned until republished; existing assignments stay.`,
                              () => act(() => admin.setCourseStatus(c, 'draft'), 'Course returned to draft.'))} />
                        )}
                        {c.status !== 'archived' ? (
                          s.active > 0 || c.status === 'published' ? (
                            <IconAction icon={Archive} title="Archive"
                              onClick={() => onConfirm('Archive course',
                                `Archive "${c.title}"? Learners keep their history; the course can't be assigned anymore.`,
                                () => act(() => admin.setCourseStatus(c, 'archived'), 'Course archived.'))} />
                          ) : (
                            <IconAction icon={Trash2} danger title="Delete draft"
                              onClick={() => onConfirm('Delete draft course',
                                `Permanently delete draft "${c.title}"? This cannot be undone.`,
                                () => act(() => admin.deleteCourse(c.id), 'Draft deleted.'))} />
                          )
                        ) : (
                          <IconAction icon={Undo2} title="Restore to draft" onClick={() => act(() => admin.setCourseStatus(c, 'draft'), 'Course restored to draft.')} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Manual-complete mini modal ────────────────────────────────────────────
function ManualCompleteModal({ assignment, onConfirm, onClose }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!assignment) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold text-slate-900">Mark complete manually</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Complete <b>{assignment.training_courses?.title}</b> for <b>{memberName(assignment.users)}</b>?
          This is recorded with your name and the date.
        </p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Optional note (e.g. completed in live session on 07-20)"
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(note); onClose(); } finally { setBusy(false); } }}>
            {busy ? 'Saving…' : 'Mark Complete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Assignments tab ───────────────────────────────────────────────────────
export function AdminAssignments({ admin, onOpenAssign, onConfirm, onToast }) {
  const { assignments, itemsByCourse, completionCounts, courses } = admin;
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [manualTarget, setManualTarget] = useState(null);
  const [editingDue, setEditingDue] = useState(null); // assignment id
  const today = todayStr();

  const q = search.trim().toLowerCase();
  const rows = assignments
    .map((a) => {
      const total = (itemsByCourse.get(a.course_id) ?? []).length;
      const done = Math.min(completionCounts.get(a.id) ?? 0, total);
      return { ...a, total, done, disp: displayStatus(a, today) };
    })
    .filter((a) =>
      (courseFilter === 'all' || a.course_id === courseFilter)
      && (statusFilter === 'all' || a.disp === statusFilter)
      && (!q || memberName(a.users).toLowerCase().includes(q) || a.training_courses?.title?.toLowerCase().includes(q)));

  const act = async (fn, success) => {
    try { await fn(); if (success) onToast({ type: 'success', message: success }); }
    catch (ex) { onToast({ type: 'error', message: ex.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by employee or course…" />
        <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="h-9 sm:w-52">
          <option value="all">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 sm:w-40">
          <option value="all">All statuses</option>
          {Object.entries(ASSIGNMENT_STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </Select>
        <Button size="sm" onClick={() => onOpenAssign(null)}><Plus size={14} /> Assign Training</Button>
      </div>

      {rows.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{assignments.length === 0 ? 'No training assigned yet' : 'Nothing matches these filters'}</p>
          {assignments.length === 0 && <Button size="sm" className="mt-4" onClick={() => onOpenAssign(null)}><Plus size={14} /> Assign Training</Button>}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Employee', 'Course', 'Source', 'Assigned', 'Due', 'Progress', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="block text-sm font-medium text-slate-800">{memberName(a.users)}</span>
                    <span className="text-xs capitalize text-slate-400">{a.users?.role === 'company_admin' ? 'Admin' : a.users?.role}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{a.training_courses?.title ?? '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-400">{a.assignment_source}{a.source_reference ? `: ${a.source_reference}` : ''}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{fmtDate(a.assigned_at)}</td>
                  <td className="px-4 py-3">
                    {editingDue === a.id ? (
                      <input type="date" defaultValue={a.due_date ?? ''} autoFocus
                        onBlur={(e) => { setEditingDue(null); if (e.target.value !== (a.due_date ?? '')) act(() => admin.updateAssignment(a.id, { due_date: e.target.value || null }), 'Due date updated.'); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingDue(null); }}
                        className="h-8 rounded-lg border border-blue-400 px-2 text-xs outline-none ring-2 ring-blue-500/20" />
                    ) : (
                      <button type="button" onClick={() => setEditingDue(a.id)} title="Change due date"
                        className={cn('flex items-center gap-1 text-sm tabular-nums hover:text-blue-600',
                          isOverdue(a, today) ? 'font-semibold text-rose-500' : 'text-slate-500')}>
                        <CalendarClock size={12} className="text-slate-300" /> {a.due_date ? fmtDate(a.due_date) : '—'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex w-28 items-center gap-2">
                      <ProjectProgressBar pct={courseProgress(a.done, a.total)} className="flex-1" />
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{a.done}/{a.total}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><TrainingStatusBadge status={a.disp} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      {a.status !== 'completed' ? (
                        <IconAction icon={CheckCircle2} title="Mark complete manually" onClick={() => setManualTarget(a)} />
                      ) : (
                        <IconAction icon={RotateCcw} title="Reopen assignment"
                          onClick={() => onConfirm('Reopen assignment',
                            `Reopen "${a.training_courses?.title}" for ${memberName(a.users)}? Their item history is preserved.`,
                            () => act(() => admin.reopenAssignment(a), 'Assignment reopened.'))} />
                      )}
                      {a.status !== 'completed' && (
                        <IconAction icon={Trash2} danger title="Remove assignment"
                          onClick={() => onConfirm('Remove assignment',
                            `Remove "${a.training_courses?.title}" from ${memberName(a.users)}? Their item progress on this course will be deleted.`,
                            () => act(() => admin.removeAssignment(a.id), 'Assignment removed.'))} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManualCompleteModal
        assignment={manualTarget}
        onClose={() => setManualTarget(null)}
        onConfirm={(note) => act(() => admin.manualComplete(manualTarget, note), 'Marked complete.')}
      />
    </div>
  );
}

// ── Certifications tab ────────────────────────────────────────────────────
export function AdminCertifications({ admin, onEditCert, onNewCert, onConfirm, onToast }) {
  const { certifications } = admin;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [issuerFilter, setIssuerFilter] = useState('all');
  const today = todayStr();

  const issuers = [...new Set(certifications.map((c) => c.issuing_org).filter(Boolean))].sort();
  const q = search.trim().toLowerCase();
  const rows = certifications
    .filter((c) =>
      (statusFilter === 'all' || certStatus(c, today) === statusFilter)
      && (issuerFilter === 'all' || c.issuing_org === issuerFilter)
      && (!q || memberName(c.users).toLowerCase().includes(q) || c.name.toLowerCase().includes(q)))
    .sort((a, b) => compareCerts(a, b, today));

  const act = async (fn, success) => {
    try { await fn(); if (success) onToast({ type: 'success', message: success }); }
    catch (ex) { onToast({ type: 'error', message: ex.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by employee or certification…" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 sm:w-40">
          <option value="all">All statuses</option>
          <option value="expired">Expired</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="active">Active</option>
          <option value="non_expiring">Non-Expiring</option>
        </Select>
        {issuers.length > 0 && (
          <Select value={issuerFilter} onChange={(e) => setIssuerFilter(e.target.value)} className="h-9 sm:w-44">
            <option value="all">All issuers</option>
            {issuers.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        )}
        <Button size="sm" onClick={onNewCert}><Plus size={14} /> Add Certification</Button>
      </div>

      {rows.length === 0 ? (
        <Card className="py-16 text-center">
          <Award size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{certifications.length === 0 ? 'No certifications on file' : 'Nothing matches these filters'}</p>
          {certifications.length === 0 && <Button size="sm" className="mt-4" onClick={onNewCert}><Plus size={14} /> Add Certification</Button>}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Employee', 'Certification', 'Issuer', 'Issued', 'Expires', 'Status', 'Proof', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const st = certStatus(c, today);
                const days = certDaysUntilExpiry(c, today);
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{memberName(c.users)}</td>
                    <td className="px-4 py-3">
                      <span className="block text-sm text-slate-700">{c.name}</span>
                      {c.cert_number && <span className="text-xs text-slate-400">#{c.cert_number}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{c.issuing_org ?? '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-slate-500">{c.issue_date ? fmtDate(c.issue_date) : '—'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums">
                      {c.expiry_date ? (
                        <span className={cn(st === 'expired' ? 'font-semibold text-rose-500' : st === 'expiring_soon' ? 'font-medium text-amber-600' : 'text-slate-500')}>
                          {fmtDate(c.expiry_date)}
                          {days != null && days >= 0 && st !== 'active' && <span className="ml-1 text-xs">({days}d)</span>}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3"><CertStatusBadge status={st} /></td>
                    <td className="px-4 py-3">
                      {c.proof_path ? (
                        <button type="button" onClick={() => openStoredFile(c.proof_path, PROOF_BUCKET)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                          <ExternalLink size={11} /> View
                        </button>
                      ) : <span className="text-xs text-slate-300">None</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconAction icon={Pencil} title="Edit" onClick={() => onEditCert(c)} />
                        <IconAction icon={Trash2} danger title="Delete"
                          onClick={() => onConfirm('Delete certification',
                            `Delete "${c.name}" for ${memberName(c.users)}? This cannot be undone.`,
                            () => act(() => admin.deleteCertification(c), 'Certification deleted.'))} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Training Dashboard tab ────────────────────────────────────────────────
export function TrainingDashboard({ admin }) {
  const { courses, assignments, itemsByCourse, completionCounts, certifications, members } = admin;
  const [empFilter, setEmpFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [certWindow, setCertWindow] = useState('expiring'); // expiring | expired | all
  const today = todayStr();

  const rows = useMemo(() => assignments.map((a) => {
    const total = (itemsByCourse.get(a.course_id) ?? []).length;
    const done = Math.min(completionCounts.get(a.id) ?? 0, total);
    return { ...a, total, done, pct: courseProgress(done, total), disp: displayStatus(a, today) };
  }), [assignments, itemsByCourse, completionCounts, today]);

  const filteredRows = rows.filter((a) =>
    (empFilter === 'all' || a.user_id === empFilter)
    && (courseFilter === 'all' || a.course_id === courseFilter)
    && (statusFilter === 'all' || a.disp === statusFilter));

  const overdueRows = rows
    .filter((a) => a.disp === 'overdue')
    .map((a) => ({ ...a, daysOverdue: Math.max(0, Math.round((new Date(today) - new Date(a.due_date)) / 86400000)) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const certRows = certifications
    .map((c) => ({ ...c, st: certStatus(c, today), days: certDaysUntilExpiry(c, today) }))
    .filter((c) => certWindow === 'all' ? c.st !== 'non_expiring'
      : certWindow === 'expired' ? c.st === 'expired' : c.st === 'expiring_soon')
    .sort((a, b) => compareCerts(a, b, today));

  const stats = {
    published: courses.filter((c) => c.status === 'published').length,
    active: rows.length,
    rate: rows.length ? Math.round((rows.filter((a) => a.status === 'completed').length / rows.length) * 100) : 0,
    notStarted: rows.filter((a) => a.disp === 'not_started').length,
    inProgress: rows.filter((a) => a.disp === 'in_progress').length,
    overdue: overdueRows.length,
    expiring: certifications.filter((c) => certStatus(c, today) === 'expiring_soon').length,
    expired: certifications.filter((c) => certStatus(c, today) === 'expired').length,
  };

  const exportCompletion = () => exportRowsCSV([
    ['Employee', 'Role', 'Course', 'Assigned', 'Due', 'Progress %', 'Completed Items', 'Total Items', 'Status', 'Completed On'],
    ...filteredRows.map((a) => [
      memberName(a.users), a.users?.role ?? '', a.training_courses?.title ?? '', fmtDate(a.assigned_at),
      a.due_date ? fmtDate(a.due_date) : '', a.pct, a.done, a.total,
      ASSIGNMENT_STATUS_CONFIG[a.disp]?.label ?? a.disp, a.completed_at ? fmtDate(a.completed_at) : '',
    ]),
  ], 'Training_Completion.csv');

  const exportOverdue = () => exportRowsCSV([
    ['Employee', 'Course', 'Due', 'Days Overdue', 'Progress %', 'Source'],
    ...overdueRows.map((a) => [
      memberName(a.users), a.training_courses?.title ?? '', fmtDate(a.due_date), a.daysOverdue, a.pct,
      `${a.assignment_source}${a.source_reference ? `: ${a.source_reference}` : ''}`,
    ]),
  ], 'Training_Overdue.csv');

  const exportCerts = () => exportRowsCSV([
    ['Employee', 'Certification', 'Issuer', 'Expiry', 'Days Until Expiry', 'Status', 'Proof on File'],
    ...certRows.map((c) => [
      memberName(c.users), c.name, c.issuing_org ?? '', c.expiry_date ? fmtDate(c.expiry_date) : '',
      c.days ?? '', certStatus(c, today).replace('_', ' '), c.proof_path ? 'Yes' : 'No',
    ]),
  ], 'Certifications_Expiring.csv');

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Published Courses', stats.published, 'text-slate-800'],
          ['Active Assignments', stats.active, 'text-slate-800'],
          ['Completion Rate', `${stats.rate}%`, 'text-emerald-600'],
          ['Not Started', stats.notStarted, 'text-slate-500'],
          ['In Progress', stats.inProgress, 'text-violet-600'],
          ['Overdue', stats.overdue, 'text-rose-600'],
          ['Certs Expiring ≤90d', stats.expiring, 'text-amber-600'],
          ['Certs Expired', stats.expired, 'text-rose-600'],
        ].map(([label, value, tone]) => (
          <Card key={label} className="p-4 text-center">
            <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </Card>
        ))}
      </div>

      {/* Completion by person and course */}
      <div className="space-y-3">
        <SectionHead title="Completion by Person & Course" onExport={exportCompletion} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="h-9 sm:w-48">
            <option value="all">All employees</option>
            {members.filter((m) => m.role !== 'viewer').map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
          </Select>
          <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="h-9 sm:w-52">
            <option value="all">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 sm:w-40">
            <option value="all">All statuses</option>
            {Object.entries(ASSIGNMENT_STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </Select>
        </div>
        {filteredRows.length === 0 ? (
          <Card className="py-10 text-center text-sm text-slate-400">No assignments match.</Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Employee', 'Course', 'Assigned', 'Due', 'Progress', 'Status', 'Completed'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{memberName(a.users)}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{a.training_courses?.title}</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500">{fmtDate(a.assigned_at)}</td>
                    <td className={cn('px-4 py-2.5 text-sm tabular-nums', isOverdue(a, today) ? 'font-semibold text-rose-500' : 'text-slate-500')}>
                      {a.due_date ? fmtDate(a.due_date) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex w-28 items-center gap-2">
                        <ProjectProgressBar pct={a.pct} className="flex-1" />
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{a.done}/{a.total}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><TrainingStatusBadge status={a.disp} /></td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500">{a.completed_at ? fmtDate(a.completed_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overdue */}
      <div className="space-y-3">
        <SectionHead title={`Overdue Assignments (${overdueRows.length})`} onExport={exportOverdue} />
        {overdueRows.length === 0 ? (
          <Card className="py-10 text-center text-sm text-slate-400">Nothing overdue — nice.</Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-rose-200 bg-white shadow-sm shadow-slate-900/[0.03]">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-rose-100 bg-rose-50/60">
                  {['Employee', 'Course', 'Due', 'Days Overdue', 'Progress', 'Source'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-rose-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overdueRows.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{memberName(a.users)}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{a.training_courses?.title}</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-rose-500">{fmtDate(a.due_date)}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold tabular-nums text-rose-600">{a.daysOverdue}d</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500">{a.pct}%</td>
                    <td className="px-4 py-2.5 text-xs capitalize text-slate-400">{a.assignment_source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certification expirations */}
      <div className="space-y-3">
        <SectionHead title="Certification Expirations" onExport={exportCerts} />
        <div className="flex gap-1 rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03] sm:w-fit">
          {[['expiring', `Expiring ≤90d (${stats.expiring})`], ['expired', `Expired (${stats.expired})`], ['all', 'All dated certs']].map(([id, label]) => (
            <button key={id} onClick={() => setCertWindow(id)}
              className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                certWindow === id ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
              {label}
            </button>
          ))}
        </div>
        {certRows.length === 0 ? (
          <Card className="py-10 text-center text-sm text-slate-400">
            {certWindow === 'expired' ? 'No expired certifications.' : 'Nothing expiring in this window.'}
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Employee', 'Certification', 'Issuer', 'Expiry', 'Days Left', 'Proof'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certRows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800">{memberName(c.users)}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{c.name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">{c.issuing_org ?? '—'}</td>
                    <td className={cn('px-4 py-2.5 text-sm tabular-nums', c.st === 'expired' ? 'font-semibold text-rose-500' : 'text-amber-600')}>
                      {fmtDate(c.expiry_date)}
                    </td>
                    <td className="px-4 py-2.5 text-sm tabular-nums text-slate-500">{c.days != null && c.days >= 0 ? `${c.days}d` : `${-c.days}d ago`}</td>
                    <td className="px-4 py-2.5">
                      {c.proof_path ? (
                        <button type="button" onClick={() => openStoredFile(c.proof_path, PROOF_BUCKET)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                          <ExternalLink size={11} /> View
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-500"><AlertCircle size={11} /> Missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
