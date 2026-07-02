'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { getCrmSnapshot, getCrmServerSnapshot, subscribeCrm, writeCrm, newCrmId } from '@/lib/crmLocalStore';

const PAGE_SIZE = 100;

export function useCRMAccounts(session, company, user) {
  const supabase = getSupabase();
  const localData = useSyncExternalStore(subscribeCrm, getCrmSnapshot, getCrmServerSnapshot);
  const companyId = company?.id;
  const userId    = user?.id;

  const [remoteAccounts, setRemoteAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error, count } = await supabase
      .from('crm_accounts')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('name')
      .range(0, limit - 1);
    setLoadError(error?.message ?? null);
    if (!error) {
      setRemoteAccounts(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [supabase, companyId, limit]);

  const loadMore = useCallback(() => setLimit((l) => l + PAGE_SIZE), []);
  const hasMore = !!supabase && totalCount > limit;

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, refresh]);

  const accounts = supabase ? remoteAccounts : localData.accounts;

  const createAccount = useCallback(async (data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      const a = { id: newCrmId(), company_id: 'local', ...data, created_at: now, updated_at: now };
      writeCrm((s) => ({ ...s, accounts: [a, ...s.accounts] }));
      return a;
    }
    const { data: a, error } = await supabase
      .from('crm_accounts')
      .insert({ company_id: companyId, created_by: userId, ...data })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return a;
  }, [supabase, companyId, userId, refresh]);

  const updateAccount = useCallback(async (id, data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      writeCrm((s) => ({ ...s, accounts: s.accounts.map((a) => a.id === id ? { ...a, ...data, updated_at: now } : a) }));
      return;
    }
    const { error } = await supabase.from('crm_accounts').update({ ...data, updated_at: now }).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const deleteAccount = useCallback(async (id) => {
    if (!supabase) {
      writeCrm((s) => ({
        ...s,
        accounts: s.accounts.filter((a) => a.id !== id),
        contacts: s.contacts.filter((c) => c.account_id !== id),
      }));
      return;
    }
    const { error } = await supabase.from('crm_accounts').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { accounts, loading, loadError, hasMore, totalCount, loadMore, refresh, createAccount, updateAccount, deleteAccount };
}
