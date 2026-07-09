// Best-effort activity logging — a failed insert here must never break the
// mutation that triggered it, so errors are swallowed rather than thrown.
export async function logActivity(supabase, { companyId, actorId, verb, entityType, entityId, label }) {
  if (!supabase || !companyId) return;
  try {
    await supabase.from('activity_log').insert({
      company_id: companyId,
      actor_id: actorId ?? null,
      verb,
      entity_type: entityType,
      entity_id: entityId ?? null,
      label,
    });
  } catch {
    // no-op
  }
}
