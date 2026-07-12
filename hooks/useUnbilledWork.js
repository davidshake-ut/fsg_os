'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// The "revenue leakage" report — work the customer signed off on but that
// hasn't been billed:
//   items             approved change orders with no invoice
//   unbilledProjects  COMPLETED projects with no invoice at all
export function useUnbilledWork(session, company) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [items, setItems] = useState([]);
  const [unbilledProjects, setUnbilledProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const [coRes, invRes, projRes, projInvRes] = await Promise.all([
      supabase.from('change_orders')
        .select('id, title, subtotal, line_items, approved_at, project_id, psa_projects(name)')
        .eq('company_id', companyId).eq('status', 'approved')
        .order('approved_at', { ascending: false }),
      supabase.from('invoices').select('change_order_id').eq('company_id', companyId).not('change_order_id', 'is', null),
      supabase.from('psa_projects')
        .select('id, name, customer_name, budget, quote_id, crm_account_id')
        .eq('company_id', companyId).eq('status', 'complete'),
      supabase.from('invoices').select('project_id').eq('company_id', companyId).not('project_id', 'is', null),
    ]);
    const billedIds = new Set((invRes.data ?? []).map((i) => i.change_order_id));
    setItems((coRes.data ?? []).filter((co) => !billedIds.has(co.id)));
    const invoicedProjectIds = new Set((projInvRes.data ?? []).map((i) => i.project_id));
    setUnbilledProjects((projRes.data ?? []).filter((p) => !invoicedProjectIds.has(p.id)));
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  const totalValue = items.reduce((s, co) => s + (Number(co.subtotal) || 0), 0)
    + unbilledProjects.reduce((s, p) => s + (Number(p.budget) || 0), 0);

  return { items, unbilledProjects, totalValue, loading, refresh };
}
