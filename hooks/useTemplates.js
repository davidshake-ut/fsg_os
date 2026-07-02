'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { SYSTEM_TEMPLATES } from '@/lib/templates/index';

// Manages company-owned project templates.
// System templates (from lib/templates/) are always available as read-only.
export function useTemplates(session, company, user) {
  const supabase  = getSupabase();
  const companyId = company?.id;
  const userId    = user?.id;

  const [companyTemplates, setCompanyTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data: templates, error } = await supabase
      .from('project_templates')
      .select('*, template_phases(*, template_tasks(*))')
      .eq('company_id', companyId)
      .order('name');
    setLoadError(error?.message ?? null);
    if (!error) setCompanyTemplates(templates ?? []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, refresh]);

  // ---- CRUD ----
  const createTemplate = useCallback(async ({ name, description = '', technology }) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('project_templates')
      .insert({ company_id: companyId, created_by: userId, name, description, technology })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, companyId, userId, refresh]);

  const updateTemplate = useCallback(async (id, patch) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('project_templates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteTemplate = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('project_templates').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const addPhase = useCallback(async (templateId, { name, order_index }) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('template_phases')
      .insert({ template_id: templateId, company_id: companyId, name, order_index })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, companyId, refresh]);

  const updatePhase = useCallback(async (id, patch) => {
    if (!supabase) return;
    const { error } = await supabase.from('template_phases').update(patch).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deletePhase = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('template_phases').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const addTask = useCallback(async (phaseId, templateId, { name, description = '', duration_days = 1, role = '', order_index = 0 }) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('template_tasks')
      .insert({ phase_id: phaseId, template_id: templateId, company_id: companyId, name, description, duration_days, role, order_index })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, companyId, refresh]);

  const updateTask = useCallback(async (id, patch) => {
    if (!supabase) return;
    const { error } = await supabase.from('template_tasks').update(patch).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteTask = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('template_tasks').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  // Clone a system template into company-owned DB rows so it can be edited.
  // Phases and tasks are batch-inserted (3 requests total) rather than one
  // insert-plus-refresh per row.
  const cloneSystemTemplate = useCallback(async (systemTemplate) => {
    if (!supabase) return;
    const { data: tmpl, error } = await supabase
      .from('project_templates')
      .insert({
        company_id: companyId,
        created_by: userId,
        name: `${systemTemplate.name} (Copy)`,
        description: systemTemplate.description,
        technology: systemTemplate.technology,
      })
      .select()
      .single();
    if (error) throw error;

    const { data: phases, error: phErr } = await supabase
      .from('template_phases')
      .insert(systemTemplate.phases.map((p) => ({
        template_id: tmpl.id,
        company_id: companyId,
        name: p.name,
        order_index: p.order,
      })))
      .select();
    if (phErr) throw phErr;

    const phaseIdByOrder = new Map(phases.map((ph) => [ph.order_index, ph.id]));
    const taskRows = systemTemplate.phases.flatMap((p) =>
      p.tasks.map((t) => ({
        phase_id: phaseIdByOrder.get(p.order),
        template_id: tmpl.id,
        company_id: companyId,
        name: t.name,
        description: t.description,
        duration_days: t.duration_days,
        role: t.role,
        order_index: t.order,
      }))
    );
    if (taskRows.length) {
      const { error: tErr } = await supabase.from('template_tasks').insert(taskRows);
      if (tErr) throw tErr;
    }
    await refresh();
    return tmpl;
  }, [supabase, companyId, userId, refresh]);

  // Normalise a system template or a DB template into the same shape for rendering.
  function normalise(t) {
    if (t.isSystem) return t;
    return {
      ...t,
      isSystem: false,
      phases: (t.template_phases ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((ph) => ({
          ...ph,
          order: ph.order_index,
          tasks: (ph.template_tasks ?? [])
            .sort((a, b) => a.order_index - b.order_index)
            .map((tk) => ({ ...tk, order: tk.order_index })),
        })),
    };
  }

  const allTemplates = [
    ...SYSTEM_TEMPLATES,
    ...companyTemplates.map(normalise),
  ];

  return {
    allTemplates,
    systemTemplates: SYSTEM_TEMPLATES,
    companyTemplates: companyTemplates.map(normalise),
    loading,
    loadError,
    refresh,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addPhase,
    updatePhase,
    deletePhase,
    addTask,
    updateTask,
    deleteTask,
    cloneSystemTemplate,
  };
}
