'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Properties of the sales chain Account -> Property -> Proposal -> Project
// (migration 0040). Pass accountId to scope to one account (the Builder's
// property picker); omit it to list all of the company's properties.
export function useProperties(session, company, accountId = null) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    let query = supabase.from('properties').select('*').eq('company_id', companyId).order('name');
    if (accountId) query = query.eq('crm_account_id', accountId);
    const { data, error } = await query;
    setLoadError(error?.message ?? null);
    if (!error) setProperties(data ?? []);
    setLoading(false);
  }, [supabase, companyId, accountId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  const createProperty = useCallback(async ({ crmAccountId, name, address = null, notes = null }) => {
    if (!supabase || !companyId || !crmAccountId || !name?.trim()) return null;
    const { data, error } = await supabase
      .from('properties')
      .insert({ company_id: companyId, crm_account_id: crmAccountId, name: name.trim(), address, notes })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, companyId, refresh]);

  const updateProperty = useCallback(async (id, patch) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('properties')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteProperty = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { properties, loading, loadError, refresh, createProperty, updateProperty, deleteProperty };
}
