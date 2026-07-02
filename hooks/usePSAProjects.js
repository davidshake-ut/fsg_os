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
    async ({ technologies = [], ...data }) => {
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
        await supabase.from('project_technologies').insert(
          technologies.map((technology, i) => ({
            project_id: proj.id,
            company_id: company?.id,
            technology,
            order_index: i,
          }))
        );
      }
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
