'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Assets/devices for a single project. Each asset's linked support-ticket
// count comes along for free via PostgREST's embedded-resource count
// (support_tickets.asset_id -> assets.id), no separate query needed.
export function useAssets(session, company, projectId) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('assets')
      .select('*, support_tickets(count)')
      .eq('project_id', projectId)
      .order('created_at');
    if (!error) setAssets(data ?? []);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => {
    if (!supabase || !session || !projectId) return;
    void refresh();
  }, [supabase, session, projectId, refresh]);

  const createAsset = useCallback(async (data) => {
    if (!supabase || !companyId || !projectId) return;
    const { error } = await supabase.from('assets').insert({ company_id: companyId, project_id: projectId, ...data });
    if (error) throw error;
    await refresh();
  }, [supabase, companyId, projectId, refresh]);

  const updateAsset = useCallback(async (id, data) => {
    if (!supabase) return;
    const { error } = await supabase.from('assets').update(data).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteAsset = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('assets').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { assets, loading, refresh, createAsset, updateAsset, deleteAsset };
}
