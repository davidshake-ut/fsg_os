'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { resolveModuleConfig } from '@/lib/moduleConfig';

// Resolves the current team's module configs: stock defaults overlaid with
// each module's assigned variant (company_modules.variant_id → the
// module_variants embed). Local mode / no assignments → stock everywhere.
export function useModuleConfigs() {
  const { company, session } = useSession();
  const [variantByModule, setVariantByModule] = useState({}); // { module_key: { name, config } }

  const load = useCallback(async (companyId) => {
    const supabase = getSupabase();
    if (!supabase || !companyId) return;
    const { data } = await supabase
      .from('company_modules')
      .select('module_key, variant_id, module_variants(name, config)')
      .eq('company_id', companyId)
      .not('variant_id', 'is', null);
    const map = {};
    for (const row of data ?? []) {
      if (row.module_variants) map[row.module_key] = row.module_variants;
    }
    setVariantByModule(map);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session || !company) return;
    void (async () => { await load(company.id); })();
  }, [session, company, load]);

  return {
    configFor: (moduleKey) => resolveModuleConfig(moduleKey, variantByModule[moduleKey]?.config ?? null),
    variantNameFor: (moduleKey) => variantByModule[moduleKey]?.name ?? null,
    reload: () => company && load(company.id),
  };
}
