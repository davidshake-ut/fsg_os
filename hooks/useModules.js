'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';

export const ALL_MODULE_KEYS = ['dashboard', 'crm', 'builder', 'projects', 'support', 'invoices', 'resources', 'messages'];

// Cross-component invalidation: the ModulesPanel calls notifyModulesChanged
// after a toggle so every mounted useModules (Sidebar, pages) reloads
// immediately — no page refresh needed when editing your own team.
const changeListeners = new Set();
export function notifyModulesChanged(companyId) {
  changeListeners.forEach((cb) => cb(companyId));
}

// Returns which modules are enabled for the current tenant.
// Local mode (no Supabase) and teams with no config rows → all modules on.
export function useModules() {
  const { company, session } = useSession();
  const [enabledModules, setEnabledModules] = useState(ALL_MODULE_KEYS);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (companyId) => {
    const supabase = getSupabase();
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('company_modules')
      .select('module_key, enabled')
      .eq('company_id', companyId);
    if (data && data.length > 0) {
      const map = new Map(data.map((r) => [r.module_key, r.enabled]));
      // Any key without a row is treated as enabled.
      setEnabledModules(ALL_MODULE_KEYS.filter((k) => map.get(k) !== false));
    } else {
      setEnabledModules(ALL_MODULE_KEYS);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session || !company) return;
    void (async () => {
      await load(company.id);
    })();
  }, [company, session, load]);

  // Reload when the ModulesPanel changes this company's modules.
  useEffect(() => {
    if (!company) return;
    const cb = (companyId) => { if (companyId === company.id) void load(company.id); };
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
  }, [company, load]);

  return {
    enabledModules,
    isEnabled: (key) => enabledModules.includes(key),
    loading,
    reload: () => company && load(company.id),
  };
}
