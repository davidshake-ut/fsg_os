'use client';

import { useCallback, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const LIMIT = 5;
const MIN_LEN = 2;

// Lightweight cross-module search: parallel ilike substring queries rather
// than full-text search (no tsvector/GIN index exists on these tables, and
// for the data volumes this app targets — a handful of hundred rows per
// table for a small integrator — ilike is plenty fast without that
// infrastructure). Resources already has real FTS (search_resources RPC);
// this keeps it simple here for a consistent cross-entity result shape.
export function useGlobalSearch(company) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const [results, setResults] = useState(null); // null = no query yet
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query) => {
    const q = query.trim();
    if (!supabase || !companyId || q.length < MIN_LEN) { setResults(null); return; }
    setLoading(true);
    const like = `%${q}%`;

    const [accounts, projects, tasks, quotes, invoices, tickets, resources] = await Promise.all([
      supabase.from('crm_accounts').select('id, name').eq('company_id', companyId).ilike('name', like).limit(LIMIT),
      supabase.from('psa_projects').select('id, name').eq('company_id', companyId).ilike('name', like).limit(LIMIT),
      // psa_tasks has no direct company_id column (only via project_id) — RLS
      // still scopes this correctly, an explicit filter just isn't possible here.
      supabase.from('psa_tasks').select('id, title, project_id').ilike('title', like).limit(LIMIT),
      supabase.from('saved_projects').select('id, project_name').eq('company_id', companyId).ilike('project_name', like).limit(LIMIT),
      supabase.from('invoices').select('id, title, invoice_number').eq('company_id', companyId).ilike('title', like).limit(LIMIT),
      supabase.from('support_tickets').select('id, title').eq('company_id', companyId).ilike('title', like).limit(LIMIT),
      supabase.from('resources').select('id, title').eq('company_id', companyId).ilike('title', like).limit(LIMIT),
    ]);

    setResults({
      accounts: accounts.data ?? [],
      projects: projects.data ?? [],
      tasks: tasks.data ?? [],
      quotes: quotes.data ?? [],
      invoices: invoices.data ?? [],
      tickets: tickets.data ?? [],
      resources: resources.data ?? [],
    });
    setLoading(false);
  }, [supabase, companyId]);

  const clear = useCallback(() => setResults(null), []);

  return { results, loading, search, clear };
}
