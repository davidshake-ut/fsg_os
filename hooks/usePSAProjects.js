'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getPsaSnapshot,
  getPsaServerSnapshot,
  subscribePsa,
  writePsa,
  newPsaId,
} from '@/lib/psaLocalStore';
import { logActivity } from '@/lib/activityLog';
import { computeTemplateSchedule } from '@/lib/projectTemplateSchedule';

// Project list CRUD. Returns all projects for the current tenant.
export function usePSAProjects(session, company, user) {
  const supabase = getSupabase();
  const localData = useSyncExternalStore(subscribePsa, getPsaSnapshot, getPsaServerSnapshot);
  const [remoteProjects, setRemoteProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const companyId = company?.id;
  const projects = supabase ? remoteProjects : localData.projects;

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('psa_projects')
      .select('*, saved_projects(project_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setLoadError(error?.message ?? null);
    if (!error) setRemoteProjects(data || []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !session || !companyId) return;
    void (async () => {
      await refresh();
    })();
  }, [supabase, session, companyId, refresh]);

  const createProject = useCallback(
    async ({ technologies = [], templatesByTechnology = {}, ...data }) => {
      const now = new Date().toISOString();
      if (!supabase) {
        const proj = {
          id: newPsaId(),
          company_id: 'local',
          ...data,
          created_by: 'local',
          created_at: now,
          updated_at: now,
        };
        const techs = technologies.map((technology, i) => ({
          id: newPsaId(),
          project_id: proj.id,
          company_id: 'local',
          technology,
          order_index: i,
          created_at: now,
        }));
        writePsa((s) => ({
          ...s,
          projects: [proj, ...s.projects],
          technologies: [...(s.technologies ?? []), ...techs],
        }));
        return proj;
      }
      const { data: proj, error } = await supabase
        .from('psa_projects')
        .insert({ ...data, company_id: company?.id, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      // Create technology rows after project exists
      if (technologies.length > 0) {
        const { data: techRows, error: techErr } = await supabase
          .from('project_technologies')
          .insert(
            technologies.map((technology, i) => ({
              project_id: proj.id,
              company_id: company?.id,
              technology,
              order_index: i,
            }))
          )
          .select();
        if (techErr) throw techErr;

        // Auto-generate a task plan for any technology with a matching
        // template — turns "quote accepted → blank project" into "quote
        // accepted → real dated project plan," reusing the same schedule
        // math as the manual Apply Template flow (usePSAProject.applyTemplate).
        for (const tech of techRows ?? []) {
          const template = templatesByTechnology[tech.technology];
          if (!template) continue;
          const schedule = computeTemplateSchedule(template.phases, data.start_date);
          for (const phase of schedule) {
            const { data: ms, error: msErr } = await supabase
              .from('psa_milestones')
              .insert({
                project_id: proj.id, technology_id: tech.id,
                name: phase.name, sort_order: phase.sort_order,
                start_date: phase.start_date, due_date: phase.due_date,
              })
              .select().single();
            if (msErr) throw msErr;
            if (phase.tasks.length > 0) {
              const { error: tErr } = await supabase.from('psa_tasks').insert(
                phase.tasks.map((t) => ({
                  project_id: proj.id, milestone_id: ms.id, technology_id: tech.id,
                  title: t.title, description: t.description, role: t.role,
                  status: 'todo', estimated_hours: t.estimated_hours,
                  start_date: t.start_date, due_date: t.due_date, sort_order: t.sort_order,
                }))
              );
              if (tErr) throw tErr;
            }
          }
        }
      }
      await logActivity(supabase, {
        companyId: company?.id, actorId: user?.id,
        verb: 'project.created', entityType: 'project', entityId: proj.id,
        label: `Project created: ${proj.name}`,
      });
      await refresh();
      return proj;
    },
    [supabase, company, user, refresh]
  );

  const updateProject = useCallback(
    async (id, data) => {
      const now = new Date().toISOString();
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...data, updated_at: now } : p
          ),
        }));
        return;
      }
      const { error } = await supabase
        .from('psa_projects')
        .update({ ...data, updated_at: now })
        .eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteProject = useCallback(
    async (id) => {
      if (!supabase) {
        writePsa((s) => ({
          ...s,
          projects: s.projects.filter((p) => p.id !== id),
          milestones: s.milestones.filter((m) => m.project_id !== id),
          tasks: s.tasks.filter((t) => t.project_id !== id),
          time_entries: s.time_entries.filter((e) => e.project_id !== id),
        }));
        return;
      }
      const { error } = await supabase.from('psa_projects').delete().eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  return { projects, loading, loadError, refresh, createProject, updateProject, deleteProject };
}
