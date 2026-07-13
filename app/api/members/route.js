import { getServiceClient, getCaller } from '@/lib/supabase/server';

const json = (body, status = 200) => Response.json(body, { status });

// Resolve the caller, ensure they may manage `targetUserId`, and load the
// target. Admins may manage members of their own team; super_admin any.
async function resolve(request, targetUserId) {
  const caller = await getCaller(request);
  if (!caller) return { error: json({ error: 'Unauthorized' }, 401) };
  if (caller.role !== 'company_admin' && caller.role !== 'super_admin') {
    return { error: json({ error: 'Forbidden' }, 403) };
  }
  if (!targetUserId) return { error: json({ error: 'Missing userId' }, 400) };

  const svc = getServiceClient();
  const { data: target } = await svc
    .from('users')
    .select('id, role, company_id')
    .eq('id', targetUserId)
    .single();
  if (!target) return { error: json({ error: 'Member not found' }, 404) };
  if (caller.role !== 'super_admin' && target.company_id !== caller.company_id) {
    return { error: json({ error: 'Forbidden — not your team' }, 403) };
  }
  // Only a super admin may modify a super admin.
  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    return { error: json({ error: 'Forbidden — cannot modify a super admin' }, 403) };
  }
  return { caller, svc, target };
}

// A team must keep at least one Admin: true if `target` is the last admin of
// its team (so demoting/removing them would leave the team without an Admin).
async function isLastAdmin(svc, target) {
  if (target.role !== 'company_admin' || !target.company_id) return false;
  const { count } = await svc
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', target.company_id)
    .eq('role', 'company_admin');
  return (count ?? 0) <= 1;
}

// Change a member's role (user <-> company_admin).
export async function PATCH(request) {
  const { userId, role } = await request.json();
  if (!['user', 'company_admin'].includes(role)) return json({ error: 'Invalid role' }, 400);
  const { error, svc, target } = await resolve(request, userId);
  if (error) return error;

  if (role === 'user' && (await isLastAdmin(svc, target))) {
    return json({ error: 'Cannot demote the last Admin of a team' }, 400);
  }
  const { error: dbErr } = await svc.from('users').update({ role }).eq('id', userId);
  if (dbErr) return json({ error: dbErr.message }, 400);
  return json({ ok: true });
}

// Remove a member from their team. Someone who never signed in (invited,
// never accepted) is deleted outright — auth record included — so the email
// can be re-invited fresh later. Anyone with real history keeps their login
// and just becomes teamless (their old work keeps its attribution); the
// invite route re-attaches teamless accounts.
export async function DELETE(request) {
  const { userId } = await request.json();
  const { error, svc, target } = await resolve(request, userId);
  if (error) return error;

  if (await isLastAdmin(svc, target)) {
    return json({ error: 'Cannot remove the last Admin of a team' }, 400);
  }

  const { data: authUser } = await svc.auth.admin.getUserById(userId);
  const neverSignedIn = authUser?.user && !authUser.user.last_sign_in_at;
  if (neverSignedIn) {
    const { error: rowErr } = await svc.from('users').delete().eq('id', userId);
    if (rowErr) return json({ error: rowErr.message }, 400);
    const { error: authErr } = await svc.auth.admin.deleteUser(userId);
    if (authErr) return json({ error: authErr.message }, 400);
    return json({ ok: true, deleted: true });
  }

  const { error: dbErr } = await svc
    .from('users')
    .update({ company_id: null, role: 'user' })
    .eq('id', userId);
  if (dbErr) return json({ error: dbErr.message }, 400);
  return json({ ok: true });
}
