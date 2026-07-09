'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import {
  getPsaSnapshot,
  getPsaServerSnapshot,
  subscribePsa,
  writePsa,
  newPsaId,
} from '@/lib/psaLocalStore';
import { computeTemplateSchedule } from '@/lib/projectTemplateSchedule';
import { notify } from '@/lib/notify';

// Single project detail: milestones, tasks, time entries, team members, and technology sections.
export function usePSAProject(projectId, session) {
  const supabase = getSupabase();
  const localData = useSyncExternalStore(subscribePsa, getPsaSnapshot, getPsaServerSnapshot);

  const [remoteProject,        setRemoteProject]        = useState(null);
  const [remoteMilestones,     setRemoteMilestones]     = useState([]);
  const [remoteTasks,          setRemoteTasks]          = useState([]);
  const [remoteTimeEntries,    setRemoteTimeEntries]    = useState([]);
  const [remoteTechnologies,   setRemoteTechnologies]   = useState([]);
  const [remoteChecklistItems, setRemoteChecklistItems] = useState([]);
  const [members,              setMembers]              = useState([]);
  const [loading,              setLoading]              = useState(false);

  const project      = supabase ? remoteProject      : (localData.projects.find((p) => p.id === projectId) ?? null);
  const milestones   = supabase ? remoteMilestones   : localData.milestones.filter((m) => m.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order || a.created_at?.localeCompare(b.created_at));
  const tasks        = supabase ? remoteTasks        : localData.tasks.filter((t) => t.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order || a.created_at?.localeCompare(b.created_at));
  const timeEntries  = supabase ? remoteTimeEntries  : localData.time_entries.filter((e) => e.project_id === projectId).sort((a, b) => b.logged_date?.localeCompare(a.logged_date));
  const technologies = supabase ? remoteTechnologies : (localData.technologies ?? []).filter((t) => t.project_id === projectId).sort((a, b) => a.order_index - b.order_index);
  // Local mode doesn't track checklist items (single-user store predates this
  // feature) — remote/team mode only, same tradeoff as the CRM 360° view.
  // Memoized (unlike the ternaries above) because it feeds a useCallback dep
  // array below — a bare `: []` literal branch is a fresh reference every
  // render, which exhaustive-deps flags as unstable.
  const checklistItems = useMemo(() => (supabase ? remoteChecklistItems : []), [supabase, remoteChecklistItems]);

  const refresh = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    const [projRes, msRes, taskRes, timeRes, memRes, techRes, clRes] = await Promise.all([
      supabase.from('psa_projects').select('*, saved_projects(project_name)').eq('id', projectId).single(),
      supabase.from('psa_milestones').select('*').eq('project_id', projectId).order('sort_order').order('created_at'),
      supabase.from('psa_tasks').select('*').eq('project_id', projectId).order('sort_order').order('created_at'),
      supabase.from('psa_time_entries').select('*, users(full_name, email)').eq('project_id', projectId).order('logged_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('users').select('id, full_name, email').order('full_name'),
      supabase.from('project_technologies').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('psa_task_checklist_items').select('*').eq('project_id', projectId).order('sort_order').order('created_at'),
    ]);
    setRemoteProject(projRes.data ?? null);
    setRemoteMilestones(msRes.data ?? []);
    setRemoteTasks(taskRes.data ?? []);
    setRemoteTimeEntries(timeRes.data ?? []);
    setMembers(memRes.data ?? []);
    setRemoteTechnologies(techRes.data ?? []);
    setRemoteChecklistItems(clRes.data ?? []);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => {
    if (!projectId || !supabase || !session) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, projectId, refresh]);

  // ---- Project ----
  const updateProject = useCallback(
    async (data) => {
      const now = new Date().toISOString();
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, ...data, updated_at: now } : p
          ),
        }));
        return;
      }
      const { error } = await supabase
        .from('psa_projects')
        .update({ ...data, updated_at: now })
        .eq('id', projectId);
      if (error) throw error;
      await refresh();
    },
    [supabase, projectId, refresh]
  );

  // ---- Milestones ----
  const nextSortOrder = (arr) =>
    arr.length ? Math.max(...arr.map((x) => x.sort_order ?? 0)) + 10 : 0;

  const createMilestone = useCallback(
    async (data) => {
      const now = new Date().toISOString();
      const sort_order = nextSortOrder(milestones);
      if (!supabase) {
        const m = { id: newPsaId(), project_id: projectId, ...data, sort_order, created_at: now };
        writePsa((s) => ({ ...s, milestones: [...s.milestones, m] }));
        return m;
      }
      const { data: m, error } = await supabase
        .from('psa_milestones')
        .insert({ project_id: projectId, ...data, sort_order })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return m;
    },
    [supabase, projectId, milestones, refresh]
  );

  const updateMilestone = useCallback(
    async (id, data) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...data } : m)),
        }));
        return;
      }
      const { error } = await supabase.from('psa_milestones').update(data).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteMilestone = useCallback(
    async (id) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          milestones: s.milestones.filter((m) => m.id !== id),
          tasks: s.tasks.map((t) => (t.milestone_id === id ? { ...t, milestone_id: null } : t)),
        }));
        return;
      }
      const { error } = await supabase.from('psa_milestones').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  // ---- Tasks ----
  const createTask = useCallback(
    async (data) => {
      const now = new Date().toISOString();
      const sort_order = nextSortOrder(tasks.filter((t) => t.milestone_id === (data.milestone_id ?? null)));
      if (!supabase) {
        const t = { id: newPsaId(), project_id: projectId, ...data, sort_order, created_at: now };
        writePsa((s) => ({ ...s, tasks: [...s.tasks, t] }));
        return t;
      }
      const { data: t, error } = await supabase
        .from('psa_tasks')
        .insert({ project_id: projectId, ...data, sort_order })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return t;
    },
    [supabase, projectId, tasks, refresh]
  );

  const updateTask = useCallback(
    async (id, data) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...data } : t)),
        }));
        return;
      }
      const { error } = await supabase.from('psa_tasks').update(data).eq('id', id);
      if (error) throw error;
      if (data.assignee_id) {
        const task = tasks.find((t) => t.id === id);
        if (task && task.assignee_id !== data.assignee_id) {
          await notify(supabase, {
            companyId: project?.company_id, userId: data.assignee_id,
            verb: 'task.assigned', entityType: 'task', entityId: id,
            label: `You were assigned: ${task.title}`,
            href: `/projects/${projectId}`,
          });
        }
      }
      await refresh();
    },
    [supabase, refresh, tasks, project, projectId]
  );

  const deleteTask = useCallback(
    async (id) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          tasks: s.tasks.filter((t) => t.id !== id),
          time_entries: s.time_entries.map((e) =>
            e.task_id === id ? { ...e, task_id: null } : e
          ),
        }));
        return;
      }
      const { error } = await supabase.from('psa_tasks').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  // ---- Time entries ----
  const logTime = useCallback(
    async (data) => {
      const now = new Date().toISOString();
      if (!supabase) {
        const e = { id: newPsaId(), project_id: projectId, ...data, user_id: 'local', created_at: now };
        writePsa((s) => ({ ...s, time_entries: [e, ...s.time_entries] }));
        return e;
      }
      const { data: e, error } = await supabase
        .from('psa_time_entries')
        .insert({ project_id: projectId, ...data })
        .select('*, users(full_name, email)')
        .single();
      if (error) throw error;
      await refresh();
      return e;
    },
    [supabase, projectId, refresh]
  );

  const deleteTimeEntry = useCallback(
    async (id) => {
      if (!supabase) {
        writePsa((s) => ({ ...s, time_entries: s.time_entries.filter((e) => e.id !== id) }));
        return;
      }
      const { error } = await supabase.from('psa_time_entries').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  // ---- Task checklist items ----
  const createChecklistItem = useCallback(
    async (taskId, label) => {
      if (!supabase) return; // remote/team mode only, see checklistItems above
      const sort_order = checklistItems.filter((c) => c.task_id === taskId).length * 10;
      const { data: c, error } = await supabase
        .from('psa_task_checklist_items')
        .insert({ project_id: projectId, task_id: taskId, label, sort_order })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return c;
    },
    [supabase, projectId, checklistItems, refresh]
  );

  const toggleChecklistItem = useCallback(
    async (id, is_done) => {
      if (!supabase) return;
      const { error } = await supabase.from('psa_task_checklist_items').update({ is_done }).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteChecklistItem = useCallback(
    async (id) => {
      if (!supabase) return;
      const { error } = await supabase.from('psa_task_checklist_items').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  // ---- Batch reorder / move ----
  const batchUpdateMilestones = useCallback(
    async (updates) => {
      // updates: [{ id, sort_order, technology_id?, ... }]
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          milestones: s.milestones.map((m) => {
            const u = updates.find((u) => u.id === m.id);
            const { id: _id, ...rest } = u ?? {};
            return u ? { ...m, ...rest } : m;
          }),
        }));
        return;
      }
      await Promise.all(
        updates.map(({ id, ...data }) =>
          supabase.from('psa_milestones').update(data).eq('id', id)
        )
      );
      await refresh();
    },
    [supabase, refresh]
  );

  const batchUpdateTasks = useCallback(
    async (updates) => {
      // updates: [{ id, sort_order?, milestone_id?, technology_id?, ... }]
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          tasks: s.tasks.map((t) => {
            const u = updates.find((u) => u.id === t.id);
            const { id: _id, ...rest } = u ?? {};
            return u ? { ...t, ...rest } : t;
          }),
        }));
        return;
      }
      await Promise.all(
        updates.map(({ id, ...data }) =>
          supabase.from('psa_tasks').update(data).eq('id', id)
        )
      );
      await refresh();
    },
    [supabase, refresh]
  );

  // Move a milestone (and all its tasks) to a different technology section.
  const moveMilestoneToSection = useCallback(
    async (milestoneId, toTechnologyId) => {
      const taskIds = tasks.filter((t) => t.milestone_id === milestoneId).map((t) => t.id);
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          milestones: s.milestones.map((m) =>
            m.id === milestoneId ? { ...m, technology_id: toTechnologyId } : m
          ),
          tasks: s.tasks.map((t) =>
            taskIds.includes(t.id) ? { ...t, technology_id: toTechnologyId } : t
          ),
        }));
        return;
      }
      await supabase
        .from('psa_milestones')
        .update({ technology_id: toTechnologyId })
        .eq('id', milestoneId);
      if (taskIds.length > 0) {
        await supabase
          .from('psa_tasks')
          .update({ technology_id: toTechnologyId })
          .in('id', taskIds);
      }
      await refresh();
    },
    [supabase, tasks, refresh]
  );

  // Merge one technology section into another: move all milestones + tasks then delete the section.
  const mergeTechnologies = useCallback(
    async (fromId, toId) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          milestones: s.milestones.map((m) =>
            m.technology_id === fromId ? { ...m, technology_id: toId } : m
          ),
          tasks: s.tasks.map((t) =>
            t.technology_id === fromId ? { ...t, technology_id: toId } : t
          ),
          technologies: (s.technologies ?? []).filter((t) => t.id !== fromId),
        }));
        return;
      }
      await supabase
        .from('psa_milestones')
        .update({ technology_id: toId })
        .eq('technology_id', fromId)
        .eq('project_id', projectId);
      await supabase
        .from('psa_tasks')
        .update({ technology_id: toId })
        .eq('technology_id', fromId)
        .eq('project_id', projectId);
      await supabase.from('project_technologies').delete().eq('id', fromId);
      await refresh();
    },
    [supabase, projectId, refresh]
  );

  // Clone a milestone (and all its tasks) into the same or a different technology section.
  const cloneMilestone = useCallback(
    async (milestoneId, toTechnologyId = null) => {
      const ms = milestones.find((m) => m.id === milestoneId);
      if (!ms) return;
      const msTasks = tasks
        .filter((t) => t.milestone_id === milestoneId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const techId = toTechnologyId ?? ms.technology_id;
      const sort_order = nextSortOrder(milestones.filter((m) => m.technology_id === techId));

      if (!supabase) {
        const now = new Date().toISOString();
        const newMs = {
          id: newPsaId(), project_id: projectId,
          name: ms.name + ' (copy)', technology_id: techId,
          start_date: ms.start_date ?? null, due_date: ms.due_date ?? null,
          sort_order, created_at: now,
        };
        const newTasks = msTasks.map((t, i) => ({
          ...t, id: newPsaId(), milestone_id: newMs.id, technology_id: techId,
          status: 'todo', sort_order: i * 10, created_at: now,
        }));
        writePsa((s) => ({ ...s, milestones: [...s.milestones, newMs], tasks: [...s.tasks, ...newTasks] }));
        return;
      }

      const { data: newMs, error: msErr } = await supabase
        .from('psa_milestones')
        .insert({
          project_id: projectId, name: ms.name + ' (copy)', technology_id: techId,
          start_date: ms.start_date ?? null, due_date: ms.due_date ?? null, sort_order,
        })
        .select().single();
      if (msErr) throw msErr;

      if (msTasks.length > 0) {
        const { error: tErr } = await supabase.from('psa_tasks').insert(
          msTasks.map((t, i) => ({
            project_id: projectId, milestone_id: newMs.id, technology_id: techId,
            title: t.title, description: t.description ?? null, role: t.role ?? null,
            estimated_hours: t.estimated_hours ?? null, status: 'todo', sort_order: i * 10,
          }))
        );
        if (tErr) throw tErr;
      }

      await refresh();
    },
    [supabase, projectId, milestones, tasks, refresh]
  );

  // Clone a single task into the same or a different milestone.
  const cloneTask = useCallback(
    async (taskId, toMilestoneId = null) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const msId = toMilestoneId ?? task.milestone_id;
      const targetMs = milestones.find((m) => m.id === msId);
      const techId = targetMs?.technology_id ?? task.technology_id;
      const sort_order = nextSortOrder(tasks.filter((t) => t.milestone_id === msId));

      if (!supabase) {
        const now = new Date().toISOString();
        writePsa((s) => ({
          ...s,
          tasks: [...s.tasks, {
            ...task, id: newPsaId(), milestone_id: msId, technology_id: techId,
            title: task.title + ' (copy)', status: 'todo', sort_order, created_at: now,
          }],
        }));
        return;
      }

      const { error } = await supabase.from('psa_tasks').insert({
        project_id: projectId, milestone_id: msId, technology_id: techId,
        title: task.title + ' (copy)', description: task.description ?? null,
        role: task.role ?? null, estimated_hours: task.estimated_hours ?? null,
        status: 'todo', sort_order,
      });
      if (error) throw error;
      await refresh();
    },
    [supabase, projectId, milestones, tasks, refresh]
  );

  // ---- Technologies ----
  const createTechnology = useCallback(
    async (data) => {
      const now = new Date().toISOString();
      const order_index = technologies.length;
      if (!supabase) {
        const tech = { id: newPsaId(), project_id: projectId, company_id: 'local', ...data, order_index, created_at: now };
        writePsa((s) => ({ ...s, technologies: [...(s.technologies ?? []), tech] }));
        return tech;
      }
      const { data: proj } = await supabase.from('psa_projects').select('company_id').eq('id', projectId).single();
      const { data: tech, error } = await supabase
        .from('project_technologies')
        .insert({ project_id: projectId, company_id: proj?.company_id, ...data, order_index })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return tech;
    },
    [supabase, projectId, technologies, refresh]
  );

  const updateTechnology = useCallback(
    async (id, data) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          technologies: (s.technologies ?? []).map((t) => (t.id === id ? { ...t, ...data } : t)),
        }));
        return;
      }
      const { error } = await supabase.from('project_technologies').update(data).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteTechnology = useCallback(
    async (id) => {
      if (!supabase) {
        writePsa((s) => ({ ...s, technologies: (s.technologies ?? []).filter((t) => t.id !== id) }));
        return;
      }
      const { error } = await supabase.from('project_technologies').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  // Apply a template to a technology section. Schedule math (task N+1 starts
  // when task N ends, phases chain the same way) lives in
  // lib/projectTemplateSchedule.js, shared with the Builder's "→ Project"
  // auto-generation.
  const applyTemplate = useCallback(
    async (template, technologyId, startDate) => {
      const sortBase = milestones.filter((m) => m.technology_id === technologyId).length * 10;
      const schedule = computeTemplateSchedule(template.phases, startDate);

      for (const phase of schedule) {
        const sort_order = sortBase + phase.sort_order;

        let milestone;
        if (!supabase) {
          const now = new Date().toISOString();
          milestone = {
            id: newPsaId(), project_id: projectId, technology_id: technologyId,
            name: phase.name, sort_order,
            start_date: phase.start_date, due_date: phase.due_date,
            created_at: now,
          };
          writePsa((s) => ({ ...s, milestones: [...s.milestones, milestone] }));
        } else {
          const { data: ms, error: msErr } = await supabase
            .from('psa_milestones')
            .insert({
              project_id: projectId, technology_id: technologyId,
              name: phase.name, sort_order,
              start_date: phase.start_date, due_date: phase.due_date,
            })
            .select().single();
          if (msErr) throw msErr;
          milestone = ms;
        }

        for (const t of phase.tasks) {
          if (!supabase) {
            const now = new Date().toISOString();
            writePsa((s) => ({
              ...s,
              tasks: [...s.tasks, {
                id: newPsaId(), project_id: projectId, milestone_id: milestone.id,
                technology_id: technologyId,
                title: t.title, description: t.description ?? '',
                role: t.role ?? '', status: 'todo', estimated_hours: t.estimated_hours,
                start_date: t.start_date, due_date: t.due_date,
                sort_order: t.sort_order, created_at: now,
              }],
            }));
          } else {
            const { error: tErr } = await supabase.from('psa_tasks').insert({
              project_id: projectId, milestone_id: milestone.id, technology_id: technologyId,
              title: t.title, description: t.description,
              role: t.role, status: 'todo', estimated_hours: t.estimated_hours,
              start_date: t.start_date, due_date: t.due_date,
              sort_order: t.sort_order,
            });
            if (tErr) throw tErr;
          }
        }
      }

      if (supabase) await refresh();
    },
    [supabase, projectId, milestones, refresh]
  );

  return {
    project,
    milestones,
    tasks,
    timeEntries,
    technologies,
    checklistItems,
    members,
    loading,
    refresh,
    updateProject,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createTask,
    updateTask,
    deleteTask,
    logTime,
    deleteTimeEntry,
    createChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,
    createTechnology,
    updateTechnology,
    deleteTechnology,
    applyTemplate,
    batchUpdateMilestones,
    batchUpdateTasks,
    moveMilestoneToSection,
    mergeTechnologies,
    cloneMilestone,
    cloneTask,
  };
}
