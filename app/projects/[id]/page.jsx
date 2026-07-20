'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, DollarSign, Building2, Loader2, AlertCircle,
  LayoutTemplate, Plus, Trash2, ChevronDown, ChevronRight, GitMerge, Pencil, Check, X,
  MessageSquare, Receipt,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { usePSAProject } from '@/hooks/usePSAProject';
import { useTemplates } from '@/hooks/useTemplates';
import { useConversations } from '@/hooks/useConversations';
import ProjectStatusBadge, { STATUS_CONFIG } from '@/components/projects/ProjectStatusBadge';
import TaskSection from '@/components/projects/TaskSection';
import KanbanBoard from '@/components/projects/KanbanBoard';
import GanttChart from '@/components/projects/GanttChart';
import TaskEditModal from '@/components/projects/TaskEditModal';
import { resolveBoardColumns } from '@/lib/boardColumns';
import TimeLog from '@/components/projects/TimeLog';
import ProjectBudget from '@/components/projects/ProjectBudget';
import ApplyTemplateModal from '@/components/projects/ApplyTemplateModal';
import ChangeOrderSection from '@/components/projects/ChangeOrderSection';
import AssetsSection from '@/components/projects/AssetsSection';
import AttachmentsSection from '@/components/ui/AttachmentsSection';
import AIAssistantPanel from '@/components/projects/AIAssistantPanel';
import InstalledEquipment from '@/components/projects/InstalledEquipment';
import CreateInvoiceModal from '@/components/invoices/CreateInvoiceModal';
import { useInvoices } from '@/hooks/useInvoices';
import { Select, Button } from '@/components/ui/primitives';
import { EditableField, EditableTextarea } from '@/components/ui/EditableFields';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { TECHNOLOGIES } from '@/lib/templates/index';
import { cn } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';
import { useRoleColors } from '@/hooks/useRoleColors';
import { useAssets } from '@/hooks/useAssets';

const TABS = [
  { id: 'tasks',    label: 'Tasks'         },
  { id: 'board',    label: 'Board'         },
  { id: 'gantt',   label: 'Gantt'         },
  { id: 'time',     label: 'Time Log'      },
  { id: 'budget',   label: 'Budget'        },
  { id: 'changes',  label: 'Change Orders' },
  { id: 'assets',   label: 'Assets'        },
  { id: 'files',    label: 'Files'         },
  { id: 'overview', label: 'Overview'      },
];

function fmtDate(iso) {
  if (!iso) return null;
  return fmtDateShared(iso);
}

function fmt(n) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Inline-editable tech section name pill
function EditableTechName({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = async () => {
    const v = draft.trim();
    if (v && v !== value) await onSave(v);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="rounded-full border border-blue-400 bg-white px-3 py-0.5 text-sm font-semibold text-blue-700 outline-none ring-2 ring-blue-400/20"
        />
        <button type="button" onClick={commit} aria-label="Save" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check size={13} /></button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={13} /></button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className="group flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-0.5 text-sm font-semibold text-blue-700 hover:bg-blue-200 transition-colors"
    >
      {value}
      <Pencil size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

// Small inline dropdown for "Merge into another section"
function MergeMenu({ tech, others, onMerge }) {
  const [open, setOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  if (others.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        title="Merge into another section"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 transition-colors hover:border-orange-300 hover:text-orange-600"
      >
        <GitMerge size={11} /> Merge into…
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">Move into</p>
          {others.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmState({
                  title: 'Merge sections',
                  message: `Merge "${tech.technology}" into "${o.technology}"? All phases and tasks will move.`,
                  confirmLabel: 'Merge',
                  onConfirm: () => onMerge(tech.id, o.id),
                });
              }}
              className="w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              {o.technology}
            </button>
          ))}
        </div>
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant="default"
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { session, company, user, canWrite } = useSession();
  const {
    project, milestones, tasks, timeEntries, technologies, checklistItems, members, loading,
    updateProject,
    createMilestone, updateMilestone, deleteMilestone,
    createTask, updateTask, deleteTask,
    logTime, deleteTimeEntry,
    createChecklistItem, toggleChecklistItem, deleteChecklistItem,
    createTechnology, updateTechnology, deleteTechnology, applyTemplate,
    batchUpdateMilestones, batchUpdateTasks,
    moveMilestoneToSection, mergeTechnologies,
    cloneMilestone, cloneTask,
  } = usePSAProject(id, session);
  const { assets, createAsset, deleteAsset } = useAssets(session, company, id);

  const { allTemplates } = useTemplates(session, company, user);

  const { getRoleColor, setRoleColor, getPalette } = useRoleColors();
  const { openProjectChannel } = useConversations(session, company, user);
  const { createInvoice } = useInvoices(session, company, user);

  const [tab, setTab] = useState('tasks');
  const [editTask, setEditTask] = useState(null); // task open in the shared Edit Task dialog
  const [applyModal, setApplyModal] = useState(null);
  const [addingTech, setAddingTech] = useState(false);
  const [collapsedTechs, setCollapsedTechs] = useState(new Set());
  const [confirmState, setConfirmState] = useState(null);
  const [openingChannel, setOpeningChannel] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

  const messageTeam = async () => {
    if (!project || openingChannel) return;
    setOpeningChannel(true);
    try {
      const convo = await openProjectChannel(project);
      if (convo?.id) router.push(`/messages?c=${convo.id}`);
    } finally {
      setOpeningChannel(false);
    }
  };

  const toggleTech = (techId) =>
    setCollapsedTechs((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId); else next.add(techId);
      return next;
    });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-slate-400">
        <Loader2 className="animate-spin" size={18} /> Loading project…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle size={28} className="text-slate-300" />
        <p className="text-sm">Project not found.</p>
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">← Back to Projects</Link>
      </div>
    );
  }

  const tasksDone  = tasks.filter((t) => t.status === 'done').length;
  const tasksTotal = tasks.length;
  const pct        = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const totalHours = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0);

  // Shared TaskSection props
  const sharedTaskSectionProps = {
    allProjectMilestones: milestones,
    techSections: technologies,
    onUpdateTask: updateTask,
    onDeleteTask: deleteTask,
    onUpdateMilestone: updateMilestone,
    onDeleteMilestone: deleteMilestone,
    onBatchUpdateMilestones: batchUpdateMilestones,
    onBatchUpdateTasks: batchUpdateTasks,
    onMoveMilestoneToSection: moveMilestoneToSection,
    onCloneMilestone: cloneMilestone,
    onCloneTask: cloneTask,
    getPalette,
    members,
    checklistItems,
    onCreateChecklistItem: createChecklistItem,
    onToggleChecklistItem: toggleChecklistItem,
    onDeleteChecklistItem: deleteChecklistItem,
    allProjectTasks: tasks,
    onEditTask: setEditTask,
  };

  const boardColumns = resolveBoardColumns(project);

  return (
    <div className="flex min-h-full flex-col">
      {/* Project header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/projects" className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> Projects
        </Link>

        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-slate-900">{project.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {project.customer_name && (
                <span className="flex items-center gap-1"><Building2 size={12} /> {project.customer_name}</span>
              )}
              {(project.start_date || project.end_date) && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {fmtDate(project.start_date) ?? '?'} – {fmtDate(project.end_date) ?? '?'}
                </span>
              )}
              {project.budget && (
                <span className="flex items-center gap-1"><DollarSign size={12} /> {fmt(project.budget)}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setInvoiceModalOpen(true)}>
              <Receipt size={13} /> Create Invoice
            </Button>
            <Button size="sm" variant="outline" onClick={messageTeam} disabled={openingChannel}>
              {openingChannel ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
              Message Team
            </Button>
            <Select
              className="h-8 w-36 text-xs"
              value={project.status}
              onChange={(e) => updateProject({ status: e.target.value })}
            >
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {tasksTotal > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
              <span>{tasksDone}/{tasksTotal} tasks done</span>
              <span>{pct}% · {totalHours.toFixed(1)}h logged</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full [background:var(--ui-button-bg,var(--brand,#2563eb))] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-6">

        {/* ── Tasks ── */}
        {tab === 'tasks' && (
          <div className="space-y-6">
            {technologies.length === 0 ? (
              <TaskSection
                milestones={milestones}
                tasks={tasks}
                onCreateMilestone={createMilestone}
                onCreateTask={createTask}
                {...sharedTaskSectionProps}
              />
            ) : (
              technologies.map((tech) => {
                const techMs    = milestones.filter((m) => m.technology_id === tech.id);
                const techTasks = tasks.filter((t) => t.technology_id === tech.id);
                const collapsed = collapsedTechs.has(tech.id);
                const others    = technologies.filter((t) => t.id !== tech.id);

                return (
                  <div key={tech.id}>
                    {/* Technology section header */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {/* Collapse toggle */}
                      <button
                        type="button"
                        onClick={() => toggleTech(tech.id)}
                        className="rounded p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </button>

                      {/* Tech badge — click to rename */}
                      <EditableTechName
                        value={tech.technology}
                        onSave={(name) => updateTechnology(tech.id, { technology: name })}
                      />
                      <span className="text-xs text-slate-400">
                        {techMs.length} phase{techMs.length !== 1 ? 's' : ''} · {techTasks.length} task{techTasks.length !== 1 ? 's' : ''}
                      </span>

                      {/* Apply template */}
                      <button
                        type="button"
                        onClick={() => setApplyModal({ technology: tech.technology, technologyId: tech.id })}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-600"
                      >
                        <LayoutTemplate size={12} /> Apply Template
                      </button>

                      {/* Merge into */}
                      <MergeMenu
                        tech={tech}
                        others={others}
                        onMerge={mergeTechnologies}
                      />

                      {/* Remove section */}
                      <button
                        type="button"
                        onClick={() => setConfirmState({
                          title: 'Remove section',
                          message: `Remove the "${tech.technology}" section? Tasks will become unassigned.`,
                          confirmLabel: 'Remove',
                          onConfirm: () => deleteTechnology(tech.id),
                        })}
                        className="ml-auto rounded p-1 text-slate-300 hover:text-red-500 transition-colors"
                        title="Remove section"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {!collapsed && (
                      <TaskSection
                        milestones={techMs}
                        tasks={techTasks}
                        onCreateMilestone={(d) => createMilestone({ ...d, technology_id: tech.id })}
                        onCreateTask={(d) => createTask({ ...d, technology_id: tech.id })}
                        {...sharedTaskSectionProps}
                      />
                    )}
                  </div>
                );
              })
            )}

            {/* Unassigned */}
            {technologies.length > 0 && (() => {
              const unassMs    = milestones.filter((m) => !m.technology_id);
              const unassTasks = tasks.filter((t) => !t.technology_id);
              if (unassMs.length === 0 && unassTasks.length === 0) return null;
              return (
                <div>
                  <div className="mb-3">
                    <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-medium text-slate-500">Unassigned</span>
                  </div>
                  <TaskSection
                    milestones={unassMs}
                    tasks={unassTasks}
                    onCreateMilestone={createMilestone}
                    onCreateTask={createTask}
                    {...sharedTaskSectionProps}
                  />
                </div>
              );
            })()}

            {/* Add technology section */}
            <div>
              {addingTech ? (
                <div className="flex flex-wrap gap-2">
                  {TECHNOLOGIES.filter((t) => !technologies.some((tt) => tt.technology === t)).map((tech) => (
                    <button
                      key={tech}
                      type="button"
                      onClick={async () => { await createTechnology({ technology: tech }); setAddingTech(false); }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    >
                      + {tech}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddingTech(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTech(true)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-blue-600"
                >
                  <Plus size={13} /> Add technology section
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Board ── */}
        {tab === 'board' && (
          <KanbanBoard
            tasks={tasks}
            milestones={milestones}
            members={members}
            checklistItems={checklistItems}
            getPalette={getPalette}
            onUpdateTask={updateTask}
            columns={boardColumns}
            onUpdateColumns={canWrite ? (list) => updateProject({ board_columns: list }) : undefined}
            onEditTask={setEditTask}
          />
        )}

        {/* ── Gantt ── */}
        {tab === 'gantt' && (
          <GanttChart
            technologies={technologies}
            milestones={milestones}
            tasks={tasks}
            members={members}
            onUpdateMilestone={updateMilestone}
            onUpdateTask={updateTask}
            onEditTask={setEditTask}
            getRoleColor={getRoleColor}
            setRoleColor={setRoleColor}
          />
        )}

        {/* ── Shared Edit Task dialog — opened from list, board, and Gantt ── */}
        {editTask && (
          <TaskEditModal
            task={tasks.find((t) => t.id === editTask.id) ?? editTask}
            members={members}
            milestones={milestones}
            columns={boardColumns}
            onSave={(patch) => updateTask(editTask.id, patch)}
            onClose={() => setEditTask(null)}
          />
        )}

        {/* ── Apply template modal (renders above other tabs) ── */}
        {applyModal && (
          <ApplyTemplateModal
            open
            technology={applyModal.technology}
            templates={allTemplates}
            projectStartDate={project?.start_date}
            onApply={(template, startDate) => applyTemplate(template, applyModal.technologyId, startDate)}
            onClose={() => setApplyModal(null)}
          />
        )}

        {/* ── Time Log ── */}
        {tab === 'time' && (
          <TimeLog tasks={tasks} timeEntries={timeEntries} onLog={logTime} onDelete={deleteTimeEntry} />
        )}

        {/* ── Budget ── */}
        {tab === 'budget' && (
          <div className="max-w-lg">
            <ProjectBudget project={project} tasks={tasks} timeEntries={timeEntries} />
          </div>
        )}

        {/* ── Change Orders ── */}
        {tab === 'changes' && (
          <ChangeOrderSection project={project} />
        )}

        {/* ── Assets ── */}
        {tab === 'assets' && (
          <AssetsSection
            assets={assets}
            onCreate={(data) => createAsset({ ...data, crm_account_id: project.crm_account_id ?? null })}
            onDelete={deleteAsset}
            bomSnapshot={project.saved_projects?.bom_snapshot}
          />
        )}

        {/* ── Files ── */}
        {tab === 'files' && (
          <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5">
            <AttachmentsSection projectId={id} />
          </div>
        )}

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-700">Project Details</h2>
              <div className="space-y-4">
                <EditableField label="Name" value={project.name}
                  onSave={(v) => { if (v) return updateProject({ name: v }); }} placeholder="Project name" />
                <EditableField label="Customer" value={project.customer_name}
                  onSave={(v) => updateProject({ customer_name: v })} placeholder="Customer name" />
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">Status</p>
                  <Select className="h-8 w-40 text-xs" value={project.status}
                    onChange={(e) => updateProject({ status: e.target.value })}>
                    {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                      <option key={val} value={val}>{cfg.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <EditableField label="Start" value={project.start_date}
                    onSave={(v) => updateProject({ start_date: v })} type="date" />
                  <EditableField label="End" value={project.end_date}
                    onSave={(v) => updateProject({ end_date: v })} type="date" />
                </div>
                <EditableField label="Budget (total)" value={project.budget}
                  onSave={(v) => updateProject({ budget: v ? Number(v) : null })} type="number" placeholder="$0" />
                {/* Breakdown for future POs (equipment) and time-log tracking
                    (labor); the total above stays the authoritative figure. */}
                <div className="grid grid-cols-2 gap-4">
                  <EditableField label="Equipment Budget" value={project.equipment_budget}
                    onSave={(v) => updateProject({ equipment_budget: v ? Number(v) : null })} type="number" placeholder="$0" />
                  <EditableField label="Labor Budget" value={project.labor_budget}
                    onSave={(v) => updateProject({ labor_budget: v ? Number(v) : null })} type="number" placeholder="$0" />
                </div>
                {project.saved_projects?.project_name && (
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-slate-400">Linked Quote</p>
                    <Link href={`/builder?project=${project.quote_id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {project.saved_projects.project_name}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Description</h2>
              <EditableTextarea label="" value={project.description}
                onSave={(v) => updateProject({ description: v })} placeholder="What this project covers…" />
            </div>

            <InstalledEquipment bomSnapshot={project.saved_projects?.bom_snapshot} />
          </div>

          <div className="max-w-lg">
            <AIAssistantPanel projectId={id} session={session} milestones={milestones} onCreateTask={createTask} />
          </div>
          </div>
        )}
      </div>
      {invoiceModalOpen && (
        <CreateInvoiceModal
          project={project}
          milestones={milestones}
          onSave={createInvoice}
          onClose={() => setInvoiceModalOpen(false)}
        />
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <AuthGuard>
      <OSShell>
        <ProjectDetail />
      </OSShell>
    </AuthGuard>
  );
}
