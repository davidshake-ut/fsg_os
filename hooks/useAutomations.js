'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

export function useAutomations(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [rules, setRules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const [rulesRes, runsRes] = await Promise.all([
      supabase.from('automation_rules').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('automation_runs').select('*, automation_rules(name)').eq('company_id', companyId).order('ran_at', { ascending: false }).limit(50),
    ]);
    setLoadError(rulesRes.error?.message ?? runsRes.error?.message ?? null);
    if (!rulesRes.error) setRules(rulesRes.data ?? []);
    if (!runsRes.error) setRuns(runsRes.data ?? []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  const createRule = useCallback(async (data) => {
    if (!supabase || !companyId) return;
    const { error } = await supabase.from('automation_rules').insert({ company_id: companyId, created_by: userId, ...data });
    if (error) throw error;
    await refresh();
  }, [supabase, companyId, userId, refresh]);

  const updateRule = useCallback(async (id, data) => {
    if (!supabase) return;
    const { error } = await supabase.from('automation_rules').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteRule = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('automation_rules').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { rules, runs, loading, loadError, refresh, createRule, updateRule, deleteRule };
}
