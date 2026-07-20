'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, GraduationCap, Award, Inbox, ExternalLink, Calendar, Clock,
  Library, Send, LayoutDashboard, BadgeCheck,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useMyTraining, useMyCertifications, openStoredFile, PROOF_BUCKET } from '@/hooks/useTraining';
import { useTrainingAdmin } from '@/hooks/useTrainingAdmin';
import TrainingStatusBadge, { CertStatusBadge } from '@/components/training/TrainingStatusBadge';
import ProjectProgressBar from '@/components/projects/ProjectProgressBar';
import CourseBuilder from '@/components/training/CourseBuilder';
import AssignCourseModal from '@/components/training/AssignCourseModal';
import CertificationModal from '@/components/training/CertificationModal';
import { AdminCourses, AdminAssignments, AdminCertifications, TrainingDashboard } from '@/components/training/TrainingAdmin';
import { Card } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';
import {
  courseProgress, displayStatus, isOverdue, compareMyTraining,
  certStatus, certDaysUntilExpiry, compareCerts, todayStr,
} from '@/lib/training';

const EMPLOYEE_TABS = [
  { id: 'training', label: 'My Training',       icon: GraduationCap },
  { id: 'certs',    label: 'My Certifications', icon: Award },
];

const ADMIN_TABS = [
  { id: 'courses',     label: 'Courses',        icon: Library },
  { id: 'assign',      label: 'Assignments',    icon: Send },
  { id: 'admin-certs', label: 'Certifications', icon: BadgeCheck },
  { id: 'dashboard',   label: 'Dashboard',      icon: LayoutDashboard },
];
const ADMIN_TAB_IDS = new Set(ADMIN_TABS.map((t) => t.id));

const FILTERS = [
  ['all', 'All'], ['not_started', 'Not Started'], ['in_progress', 'In Progress'],
  ['completed', 'Completed'], ['overdue', 'Overdue'],
];

function SummaryCard({ label, value, tone }) {
  return (
    <Card className="p-4 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </Card>
  );
}

function AssignmentCard({ a, today }) {
  const status = displayStatus(a, today);
  const pct = courseProgress(a.completed_items, a.total_items);
  const course = a.training_courses;
  return (
    <Link href={`/resources/training/${a.id}`}>
      <Card className="group p-5 transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{course?.title ?? 'Course'}</p>
            {course?.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{course.description}</p>}
          </div>
          <TrainingStatusBadge status={status} className="shrink-0" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ProjectProgressBar pct={pct} className="flex-1" />
          <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-600">{pct}%</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span>{a.completed_items} of {a.total_items} item{a.total_items !== 1 ? 's' : ''}</span>
          {course?.estimated_minutes && <span className="flex items-center gap-1"><Clock size={11} /> ~{course.estimated_minutes} min</span>}
          {a.due_date && (
            <span className={cn('flex items-center gap-1', isOverdue(a, today) && 'font-semibold text-rose-500')}>
              <Calendar size={11} /> Due {fmtDate(a.due_date)}
            </span>
          )}
          <span className="ml-auto font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
            {status === 'completed' ? 'Review →' : status === 'not_started' ? 'Start →' : 'Continue →'}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function MyTrainingTab() {
  const { session, company, user } = useSession();
  const { assignments, loading, loadError, refresh } = useMyTraining(session, company, user);
  const [filter, setFilter] = useState('all');
  const today = todayStr();

  const counts = {
    all: assignments.length,
    not_started: assignments.filter((a) => displayStatus(a, today) === 'not_started').length,
    in_progress: assignments.filter((a) => displayStatus(a, today) === 'in_progress').length,
    completed:   assignments.filter((a) => a.status === 'completed').length,
    overdue:     assignments.filter((a) => isOverdue(a, today)).length,
  };

  const filtered = assignments.filter((a) => filter === 'all' || displayStatus(a, today) === filter);
  const open = filtered.filter((a) => a.status !== 'completed').sort((a, b) => compareMyTraining(a, b, today));
  const done = filtered.filter((a) => a.status === 'completed');

  return (
    <div className="space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Assigned"    value={counts.all}         tone="text-slate-800" />
        <SummaryCard label="Not Started" value={counts.not_started} tone="text-slate-500" />
        <SummaryCard label="In Progress" value={counts.in_progress} tone="text-violet-600" />
        <SummaryCard label="Completed"   value={counts.completed}   tone="text-emerald-600" />
        <SummaryCard label="Overdue"     value={counts.overdue}     tone="text-rose-600" />
      </div>

      {/* Filter */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
              filter === id ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
            {label} <span className="ml-0.5 text-xs opacity-70">{counts[id]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading your training…</p>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            {assignments.length === 0 ? 'No training assigned yet' : 'Nothing matches this filter'}
          </p>
          {assignments.length === 0 && (
            <p className="mt-1 text-sm text-slate-400">Courses your admin assigns to you will show up here.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {open.map((a) => <AssignmentCard key={a.id} a={a} today={today} />)}
          {done.length > 0 && open.length > 0 && (
            <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Completed</p>
          )}
          {done.map((a) => <AssignmentCard key={a.id} a={a} today={today} />)}
        </div>
      )}
    </div>
  );
}

function MyCertificationsTab() {
  const { session, company, user } = useSession();
  const { certifications, loading, loadError, refresh } = useMyCertifications(session, company, user);
  const today = todayStr();
  const sorted = [...certifications].sort((a, b) => compareCerts(a, b, today));

  return (
    <div className="space-y-5">
      <ErrorBanner error={loadError} onRetry={refresh} />
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading certifications…</p>
      ) : sorted.length === 0 ? (
        <Card className="py-16 text-center">
          <Award size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No certifications on file</p>
          <p className="mt-1 text-sm text-slate-400">Certifications your admin records for you will show up here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const status = certStatus(c, today);
            const days = certDaysUntilExpiry(c, today);
            return (
              <Card key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <Award size={18} className="text-slate-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {c.issuing_org || 'No issuer'}
                    {c.cert_number && <> · #{c.cert_number}</>}
                    {c.issue_date && <> · Issued {fmtDate(c.issue_date)}</>}
                  </p>
                  <p className={cn('mt-0.5 text-xs',
                    status === 'expired' ? 'font-semibold text-rose-500'
                      : status === 'expiring_soon' ? 'font-medium text-amber-600' : 'text-slate-400')}>
                    {c.expiry_date
                      ? status === 'expired'
                        ? `Expired ${fmtDate(c.expiry_date)}`
                        : `Expires ${fmtDate(c.expiry_date)}${days != null ? ` · ${days} day${days !== 1 ? 's' : ''} left` : ''}`
                      : 'Does not expire'}
                  </p>
                </div>
                {c.proof_path && (
                  <button type="button" onClick={() => openStoredFile(c.proof_path, PROOF_BUCKET)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    title={c.proof_name || 'View proof document'}>
                    <ExternalLink size={12} /> Proof
                  </button>
                )}
                <CertStatusBadge status={status} className="shrink-0" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Admin tabs share one useTrainingAdmin instance; this stays mounted while
// any admin tab is active so data doesn't refetch on every tab hop.
function AdminArea({ tab }) {
  const { session, company, user } = useSession();
  const admin = useTrainingAdmin(session, company, user);

  const [builderState, setBuilderState] = useState(null); // { course|null }
  const [assignState, setAssignState] = useState(null);   // { presetCourseId|null }
  const [certState, setCertState] = useState(null);       // { cert|null }
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);

  const onConfirm = (title, message, fn) => setConfirmState({ title, message, onConfirm: fn });
  const categories = [...new Set(admin.courses.map((c) => c.category).filter(Boolean))].sort();

  const handleBuilderSave = async (data, items, publish) => {
    let course = builderState?.course ?? null;
    if (course) await admin.updateCourse(course.id, data);
    else course = await admin.createCourse(data);
    await admin.saveCourseItems(course.id, items);
    if (publish && course.status !== 'published') {
      await admin.setCourseStatus({ ...course, ...data }, 'published');
    }
    setToast({ type: 'success', message: publish ? 'Course published.' : 'Draft saved.' });
  };

  const shared = { admin, onConfirm, onToast: setToast };

  return (
    <>
      <ErrorBanner error={admin.loadError} onRetry={admin.refresh} />
      {admin.loading && admin.courses.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {tab === 'courses' && (
            <AdminCourses {...shared}
              onNewCourse={() => setBuilderState({ course: null })}
              onEditCourse={(course) => setBuilderState({ course })}
              onAssignCourse={(course) => setAssignState({ presetCourseId: course.id })} />
          )}
          {tab === 'assign' && (
            <AdminAssignments {...shared} onOpenAssign={(presetCourseId) => setAssignState({ presetCourseId })} />
          )}
          {tab === 'admin-certs' && (
            <AdminCertifications {...shared}
              onNewCert={() => setCertState({ cert: null })}
              onEditCert={(cert) => setCertState({ cert })} />
          )}
          {tab === 'dashboard' && <TrainingDashboard admin={admin} />}
        </>
      )}

      <CourseBuilder
        open={!!builderState}
        course={builderState?.course ?? null}
        initialItems={builderState?.course ? (admin.itemsByCourse.get(builderState.course.id) ?? []) : []}
        activeAssignmentCount={builderState?.course ? admin.assignments.filter((a) => a.course_id === builderState.course.id && a.status !== 'completed').length : 0}
        categories={categories}
        onClose={() => setBuilderState(null)}
        onSaveDraft={(data, items) => handleBuilderSave(data, items, false)}
        onPublish={(data, items) => handleBuilderSave(data, items, true)}
      />
      <AssignCourseModal
        open={!!assignState}
        courses={admin.courses}
        members={admin.members}
        assignments={admin.assignments}
        presetCourseId={assignState?.presetCourseId ?? null}
        onAssign={async (course, targets, dueDate) => {
          await admin.assignCourse(course, targets, dueDate);
          setToast({ type: 'success', message: `Assigned to ${targets.length} member${targets.length !== 1 ? 's' : ''}.` });
        }}
        onClose={() => setAssignState(null)}
      />
      <CertificationModal
        open={!!certState}
        cert={certState?.cert ?? null}
        members={admin.members.filter((m) => m.role !== 'viewer')}
        onSave={async (data, proofFile) => {
          if (certState?.cert) await admin.updateCertification(certState.cert, data, proofFile);
          else await admin.createCertification(data, proofFile);
          setToast({ type: 'success', message: certState?.cert ? 'Certification updated.' : 'Certification added.' });
        }}
        onClose={() => setCertState(null)}
      />
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function TrainingContent() {
  const { isAdmin, isSuperAdmin } = useSession();
  const showAdmin = isAdmin || isSuperAdmin;
  const [tab, setTab] = useState('training');
  const tabs = showAdmin ? [...EMPLOYEE_TABS, ...ADMIN_TABS] : EMPLOYEE_TABS;

  return (
    <div className="p-6 space-y-5">
      <div>
        <Link href="/resources" className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> Resources
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Training</h1>
        <p className="mt-1 text-sm text-slate-500">
          {showAdmin ? 'Courses, assignments, certifications, and workforce readiness.' : 'Your assigned courses and certification records.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
              tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'training' && <MyTrainingTab />}
      {tab === 'certs' && <MyCertificationsTab />}
      {showAdmin && ADMIN_TAB_IDS.has(tab) && <AdminArea tab={tab} />}
    </div>
  );
}

export default function TrainingPage() {
  return <AuthGuard><OSShell><TrainingContent /></OSShell></AuthGuard>;
}
