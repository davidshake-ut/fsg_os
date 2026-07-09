'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activityLog';

const PAGE_SIZE = 100;

export function useInvoices(session, company, user) {
  const supabase  = getSupabase();
  const companyId = company?.id;

  const [invoices, setInvoices] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error, count } = await supabase
      .from('invoices')
      .select('*, psa_projects(name), saved_projects(project_name), crm_accounts(name)', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(0, limit - 1);
    setLoadError(error?.message ?? null);
    if (!error) {
      setInvoices(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [supabase, companyId, limit]);

  const loadMore = useCallback(() => setLimit((l) => l + PAGE_SIZE), []);
  const hasMore = totalCount > limit;

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  // Creation goes through the API so totals are recomputed server-side and
  // linked records are verified — the browser is not trusted with money math.
  const createInvoice = useCallback(async (data) => {
    if (!supabase || !companyId) return;
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Could not create invoice');
    await refresh();
    return payload.invoice;
  }, [supabase, companyId, session, refresh]);

  const updateInvoice = useCallback(async (id, data) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('invoices')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    if (data.status === 'paid') {
      const inv = invoices.find((i) => i.id === id);
      await logActivity(supabase, {
        companyId, actorId: user?.id,
        verb: 'invoice.paid', entityType: 'invoice', entityId: id,
        label: `Invoice ${inv?.invoice_number ?? ''} paid`.trim(),
      });
    }
    await refresh();
  }, [supabase, companyId, user, invoices, refresh]);

  const deleteInvoice = useCallback(async (id) => {
    if (!supabase) return;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { invoices, loading, loadError, hasMore, totalCount, loadMore, refresh, createInvoice, updateInvoice, deleteInvoice };
}
