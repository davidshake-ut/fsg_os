'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Per-project at-a-glance numbers for list surfaces: task progress, overdue
// count, and who's on it (distinct task assignees). One query for the whole
// visible set — dashboards and list pages shouldn't fan out per row.
export function useProjectVitals(session, company, projects) {
  const supabase = getSupabase();
  const companyId = company?.id;
  // Stable string key so the effect re-runs only when the id set changes.
  const idsKey = projects.map((p) => p.id).sort().join(',');

  const [vitals, setVitals] = useState({});

  useEffect(() => {
    if (!supabase || !session || !companyId || !idsKey) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('psa_tasks')
        .select('project_id, status, due_date, assignee_id, users(full_name, email)')
        .in('project_id', idsKey.split(','));
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      const map = {};
      for (const t of data ?? []) {
        const v = (map[t.project_id] ??= { total: 0, done: 0, overdue: 0, memberMap: new Map() });
        v.total += 1;
        if (t.status === 'done') v.done += 1;
        else if (t.due_date && t.due_date < today) v.overdue += 1;
        if (t.assignee_id && !v.memberMap.has(t.assignee_id)) {
          v.memberMap.set(t.assignee_id, t.users?.full_name || t.users?.email || '?');
        }
      }
      const next = {};
      for (const [id, v] of Object.entries(map)) {
        next[id] = {
          total: v.total,
          done: v.done,
          overdue: v.overdue,
          pct: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
          members: [...v.memberMap].map(([userId, name]) => ({ id: userId, name })),
        };
      }
      setVitals(next);
    })();
    return () => { cancelled = true; };
  }, [supabase, session, companyId, idsKey]);

  return vitals;
}
