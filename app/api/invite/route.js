import { getServiceClient, getCaller } from '@/lib/supabase/server';

const json = (body, status = 200) => Response.json(body, { status });

// Bounded lookup — the admin API has no direct get-by-email.
async function findAuthUserByEmail(svc, email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data || data.users.length < 200) break;
  }
  return null;
}

// Invite a person into a team by email.
//   - super_admin: invite into any team (must specify companyId) — used to seed
//     a new team's first Admin.
//   - company_admin: invite into their OWN team only.
// Roles are limited to 'user' and 'company_admin' (super_admin is bootstrap-only).
//
// Emails that already exist get lifecycle handling instead of a dead end:
//   - on another team                  -> 409 (super admins reassign from Members)
//   - never accepted their invite      -> stale registration wiped, fresh invite
//     sent (even if still listed on the team — invite links are single-use,
//     and a link that died mid-redirect burns the token without a password)
//   - teamless, has real history       -> re-attached to this team + emailed a
//     set-password link so they actually hear about it
//   - already active on this team      -> 409, unless `resend: true`, which
//     emails them a set-password link instead
export async function POST(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);

  const isSuper = caller.role === 'super_admin';
  const isAdmin = caller.role === 'company_admin';
  if (!isSuper && !isAdmin) return json({ error: 'Forbidden' }, 403);

  const { email, companyId: reqCompanyId, role = 'user', resend = false } = await request.json();
  if (!email) return json({ error: 'Missing email' }, 400);
  if (!['user', 'company_admin', 'viewer'].includes(role)) {
    return json({ error: 'Role must be user, company_admin, or viewer' }, 400);
  }

  // Company admins can only invite into their own team.
  const companyId = isSuper ? reqCompanyId : caller.company_id;
  if (!companyId) {
    return json({ error: isSuper ? 'Select a team for the invite' : 'No team context' }, 400);
  }

  const svc = getServiceClient();
  // Send invitees to the set-password page after they accept. The base URL
  // is pinned via NEXT_PUBLIC_SITE_URL so links always point at the real
  // app domain no matter which host the admin sent the invite from; the
  // request origin is the fallback. The URL must also be covered by the
  // Supabase dashboard's Redirect URLs allowlist — otherwise Supabase
  // silently ignores redirectTo and sends the invitee to the Site URL.
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = envBase || (host ? `${proto}://${host}` : new URL(request.url).origin);
  const sendInvite = () => svc.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/welcome` });
  // Set-password email for accounts that already exist (invite emails can
  // only go to brand-new auth users). Lands on the same /welcome page.
  const sendRecovery = () => svc.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/welcome` });

  let { data, error } = await sendInvite();
  let mode = 'invited';

  if (error && /already.*registered/i.test(error.message)) {
    const { data: existing } = await svc
      .from('users')
      .select('id, company_id')
      .eq('email', email)
      .maybeSingle();
    const authUser = await findAuthUserByEmail(svc, email);
    const pending = !!authUser && !authUser.last_sign_in_at;
    const onThisTeam = existing?.company_id === companyId;
    const onOtherTeam = !!existing?.company_id && existing.company_id !== companyId;

    if (onOtherTeam && !isSuper) {
      return json({ error: 'That email already belongs to another team.' }, 409);
    }

    if (pending) {
      // Never accepted their invite (still on the team, teamless, or being
      // refreshed by a super admin): invite links are single-use, so wipe
      // the stale registration and send a completely fresh invite.
      await svc.from('users').delete().eq('email', email);
      const { error: wipeErr } = await svc.auth.admin.deleteUser(authUser.id);
      if (wipeErr) return json({ error: wipeErr.message }, 400);
      ({ data, error } = await sendInvite());
      if (error) return json({ error: error.message }, 400);
      mode = 'reinvited';
    } else if (onThisTeam) {
      // Already an active member here. An explicit resend means "help them
      // get in" — email a set-password link (covers accounts whose invite
      // link was consumed by a broken redirect before a password existed).
      if (resend) {
        const { error: rErr } = await sendRecovery();
        if (rErr) return json({ error: rErr.message }, 400);
        return json({ ok: true, userId: existing.id, mode: 'recovery_sent' });
      }
      return json({ error: 'That email is already on this team.' }, 409);
    } else if (existing && !existing.company_id) {
      // A real account that was removed from its team: attach it here AND
      // email a set-password link so the person actually hears about it —
      // they may never have set a password at all.
      const { error: upErr } = await svc
        .from('users')
        .update({ company_id: companyId, role })
        .eq('id', existing.id);
      if (upErr) return json({ error: upErr.message }, 400);
      const { error: rErr } = await sendRecovery();
      return json({ ok: true, userId: existing.id, mode: 'reattached', recoverySent: !rErr });
    } else if (onOtherTeam && isSuper) {
      return json({ error: 'That member belongs to another team — reassign them from the Members table instead.' }, 409);
    } else {
      return json({ error: error.message }, 400);
    }
  } else if (error) {
    return json({ error: error.message }, 400);
  }

  // The on_auth_user_created trigger inserts the public.users row; set the
  // team + role on top of it — but never pull a user out of a team they already
  // belong to (a non-super inviter can't hijack another team's member).
  const id = data?.user?.id;
  if (id) {
    const { data: existing } = await svc
      .from('users')
      .select('company_id')
      .eq('id', id)
      .single();
    if (existing?.company_id && existing.company_id !== companyId && !isSuper) {
      return json({ error: 'That email already belongs to another team.' }, 409);
    }
    await svc
      .from('users')
      .upsert({ id, email, role, company_id: companyId }, { onConflict: 'id' });
  }
  return json({ ok: true, userId: id, mode });
}
