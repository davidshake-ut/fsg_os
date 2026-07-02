'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { computeCoTotals } from '@/lib/changeOrders';

const round2 = (n) => Math.round(n * 100) / 100;

export function useChangeOrders(session, company, user, projectId) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [changeOrders, setChangeOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId || !projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('change_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('project_id', projectId)
      .order('co_number', { ascending: true });
    setLoadError(error?.message ?? null);
    if (!error) setChangeOrders(data ?? []);
    setLoading(false);
  }, [supabase, companyId, projectId]);

  useEffect(() => {
    if (!supabase || !session || !companyId || !projectId) return;
    void refresh();
  }, [supabase, session, companyId, projectId, refresh]);

  const createChangeOrder = useCallback(async ({ title, description = '', line_items = [], schedule_impact_days = 0, quote_id = null }) => {
    if (!supabase || !companyId || !projectId) return;
    const totals = computeCoTotals(line_items);
    const co_number = changeOrders.reduce((n, co) => Math.max(n, co.co_number), 0) + 1;
    const { data, error } = await supabase
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        quote_id,
        created_by: user?.id ?? null,
        co_number,
        title,
        description: description || null,
        schedule_impact_days: Number(schedule_impact_days) || 0,
        ...totals,
      })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  }, [supabase, companyId, projectId, user, changeOrders, refresh]);

  const updateChangeOrder = useCallback(async (id, patch) => {
    if (!supabase) return;
    const body = { ...patch, updated_at: new Date().toISOString() };
    if (patch.line_items) Object.assign(body, computeCoTotals(patch.line_items));
    const { error } = await supabase.from('change_orders').update(body).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const setChangeOrderStatus = useCallback(async (id, status) => {
    if (!supabase) return;
    const body = {
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('change_orders').update(body).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteChangeOrder = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('change_orders').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const approvedTotal = round2(
    changeOrders.filter((co) => co.status === 'approved').reduce((s, co) => s + Number(co.subtotal || 0), 0)
  );

  return {
    changeOrders,
    loading,
    loadError,
    approvedTotal,
    refresh,
    createChangeOrder,
    updateChangeOrder,
    setChangeOrderStatus,
    deleteChangeOrder,
  };
}
