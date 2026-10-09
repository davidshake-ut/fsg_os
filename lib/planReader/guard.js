// Shared "load this plan set, make sure the caller's company owns it"
// check used by every /api/plan-sets/[id]/* route. Mirrors the inline
// ownership check in app/api/ai/project-summary/route.js, factored out
// because six routes need the same one.
import { getCaller, getServiceClient } from '@/lib/supabase/server';

export async function requirePlanSet(request, planSetId) {
  const caller = await getCaller(request);
  if (!caller) return { error: 'Unauthorized', status: 401 };
  if (!caller.company_id) return { error: 'You must be on a team to use the plan reader', status: 403 };

  const svc = getServiceClient();
  const { data: planSet } = await svc.from('plan_sets').select('*').eq('id', planSetId).single();
  if (!planSet) return { error: 'Plan set not found', status: 404 };
  if (planSet.company_id !== caller.company_id && caller.role !== 'super_admin') {
    return { error: 'Plan set not found', status: 404 };
  }

  return { caller, svc, planSet };
}
