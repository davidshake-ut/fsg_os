'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Approved change orders across the whole company that no invoice has been
// created for yet — the "revenue leakage" report: work the customer already
// signed off on but hasn't been billed.
export function useUnbilledWork(session, company) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const [coRes, invRes] = await Promise.all([
      supabase.from('change_orders')
        .select('id, title, subtotal, line_items, approved_at, project_id, psa_projects(name)')
        .eq('company_id', companyId).eq('status', 'approved')
        .order('approved_at', { ascending: false }),
      supabase.from('invoices').select('change_order_id').eq('company_id', companyId).not('change_order_id', 'is', null),
    ]);
    const billedIds = new Set((invRes.data ?? []).map((i) => i.change_order_id));
    setItems((coRes.data ?? []).filter((co) => !billedIds.has(co.id)));
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  const totalValue = items.reduce((s, co) => s + (Number(co.subtotal) || 0), 0);

  return { items, totalValue, loading, refresh };
}
