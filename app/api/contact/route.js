import { getServiceClient } from '@/lib/supabase/server';

const json = (body, status = 200) => Response.json(body, { status });

// Public partner-inquiry endpoint for the landing page. Deliberately sends
// NO email: the inquiry lands as a message in a "Partner Inquiries" channel
// in the super admin's team (Message Center) plus a bell notification that
// stays until clicked through — the app's own accountability rules.
//
// Being unauthenticated, it defends itself: honeypot field, strict field
// validation with length caps, and a light per-instance rate limit.

const hits = new Map(); // ip -> [timestamps]
function allow(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 5) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  // Honeypot: bots fill every field; humans never see this one. Pretend
  // success so scripts don't adapt.
  if (body.website) return json({ ok: true });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(ip)) return json({ error: 'Too many requests — please try again later.' }, 429);

  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const name = clean(body.name, 120);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 60);
  const company = clean(body.company, 120);
  if (!name || !email || !company) {
    return json({ error: 'Name, email, and company are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  const svc = getServiceClient();

  // The inquiry is hosted by the platform super admin's team.
  const { data: supers } = await svc
    .from('users')
    .select('id, company_id')
    .eq('role', 'super_admin')
    .not('company_id', 'is', null)
    .limit(10);
  const host = supers?.[0];
  if (!host) return json({ error: 'Unable to deliver your message right now.' }, 500);
  const hostSupers = supers.filter((s) => s.company_id === host.company_id);

  // Find or create the Partner Inquiries channel (idempotent by name/team).
  let conversationId;
  const { data: existing } = await svc
    .from('conversations')
    .select('id')
    .eq('company_id', host.company_id)
    .eq('type', 'group')
    .eq('name', 'Partner Inquiries')
    .maybeSingle();
  if (existing) {
    conversationId = existing.id;
  } else {
    const { data: created, error: convErr } = await svc
      .from('conversations')
      .insert({
        company_id: host.company_id,
        type: 'group',
        name: 'Partner Inquiries',
        created_by: host.id,
      })
      .select('id')
      .single();
    if (convErr) return json({ error: 'Unable to deliver your message right now.' }, 500);
    conversationId = created.id;
    await svc
      .from('conversation_members')
      .insert(hostSupers.map((s) => ({ conversation_id: conversationId, user_id: s.id })));
  }

  const messageBody = [
    '📨 New partner inquiry (from the landing page)',
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    `Company: ${company}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { error: msgErr } = await svc.from('messages').insert({
    conversation_id: conversationId,
    company_id: host.company_id,
    sender_id: null, // no account behind it — renders as a system-style entry
    body: messageBody,
  });
  if (msgErr) return json({ error: 'Unable to deliver your message right now.' }, 500);

  await svc
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  for (const s of hostSupers) {
    await svc.from('notifications').insert({
      company_id: s.company_id,
      user_id: s.id,
      verb: 'partner.inquiry',
      entity_type: 'conversation',
      entity_id: conversationId,
      label: `New partner inquiry: ${name} (${company})`,
      href: `/messages?c=${conversationId}`,
    });
  }

  return json({ ok: true });
}
