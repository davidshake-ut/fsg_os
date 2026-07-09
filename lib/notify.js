// Best-effort notification creation — mirrors lib/activityLog.js: a failed
// insert here must never break the action that triggered it.
export async function notify(supabase, { companyId, userId, verb, entityType, entityId, label, href }) {
  if (!supabase || !companyId || !userId) return;
  try {
    await supabase.from('notifications').insert({
      company_id: companyId,
      user_id: userId,
      verb,
      entity_type: entityType,
      entity_id: entityId ?? null,
      label,
      href: href ?? null,
    });
  } catch {
    // no-op
  }
}
