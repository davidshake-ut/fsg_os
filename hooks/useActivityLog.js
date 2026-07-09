'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const LIMIT = 15;

// Recent company-wide activity feed. Local mode has no activity log (single
// user, nothing to feed) — same tradeoff as the CRM 360° view.
export function useActivityLog(session, company) {
  const supabase = getSupabase();
  const companyId = company?.id;

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_log')
      .select('*, users(full_name, email)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    setLoadError(error?.message ?? null);
    if (!error) setEntries(data ?? []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  return { entries: supabase ? entries : [], loading, loadError, refresh };
}
