'use client';

// Training reminder sweep — the approved no-new-infrastructure scheduler.
//
// The app has no cron/queue, so reminders are computed lazily: once per
// browser session, whenever a signed-in user loads any page, this hook
// checks THEIR OWN overdue assignments and certification milestones (and,
// for admins, every team member's certification milestones) and inserts any
// missing in-app notifications.
//
// Duplicate prevention: each reminder type is a distinct notification verb
// ('training.overdue', 'training.cert_expiry_90/60/30/0') tied to the
// assignment/cert id — before inserting, existing (user, verb, entity)
// triples are fetched and skipped. Milestones fire once per crossing, and
// only the most urgent unsent milestone is sent (no 90+60+30 backfill
// bursts; see lib/training.nextCertMilestone).
//
// Everything here is best-effort: a failure logs nothing and never blocks
// the UI. If guaranteed daily delivery is ever needed, the same dedup verbs
// work unchanged from a Vercel-cron API route.

import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import {
  todayStr, isOverdue, certDaysUntilExpiry, nextCertMilestone, reminderVerb,
} from '@/lib/training';

let sweptFor = null; // user id the sweep already ran for (once per session)

export function useTrainingReminders(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;
  const isAdmin = user?.role === 'company_admin' || user?.role === 'super_admin';

  useEffect(() => {
    if (!supabase || !session || !companyId || !userId) return;
    if (sweptFor === userId) return;
    sweptFor = userId;

    void (async () => {
      try {
        const today = todayStr();

        const [assignRes, certRes] = await Promise.all([
          supabase.from('training_assignments')
            .select('id, user_id, due_date, status, training_courses(title)')
            .eq('company_id', companyId).eq('user_id', userId)
            .not('due_date', 'is', null).neq('status', 'completed'),
          // Admins sweep the whole team's certs; employees their own.
          isAdmin
            ? supabase.from('training_certifications')
                .select('id, user_id, name, expiry_date, users!training_certifications_user_id_fkey(full_name, email)')
                .eq('company_id', companyId).not('expiry_date', 'is', null)
            : supabase.from('training_certifications')
                .select('id, user_id, name, expiry_date')
                .eq('company_id', companyId).eq('user_id', userId).not('expiry_date', 'is', null),
        ]);

        const overdue = (assignRes.data ?? []).filter((a) => isOverdue(a, today));
        const certs = certRes.data ?? [];

        // Candidate notifications for ME (admins get team cert reminders;
        // each employee gets their own when they next sign in).
        const candidates = [];
        for (const a of overdue) {
          candidates.push({
            verb: 'training.overdue', entity_id: a.id,
            label: `Training overdue: ${a.training_courses?.title ?? 'course'}`,
            href: '/resources/training',
          });
        }
        for (const c of certs) {
          const milestone = nextCertMilestone(c, today);
          if (milestone == null) continue;
          const days = certDaysUntilExpiry(c, today);
          const who = c.user_id === userId ? 'Your' : `${c.users?.full_name || c.users?.email || 'Team member'}'s`;
          const when = days < 0 ? 'has expired' : days === 0 ? 'expires today' : `expires in ${days} day${days !== 1 ? 's' : ''}`;
          candidates.push({
            verb: reminderVerb('cert_expiry', milestone), entity_id: c.id,
            label: `${who} certification ${when}: ${c.name}`,
            href: '/resources/training',
          });
        }
        if (!candidates.length) return;

        // Dedup against what this user has already been sent.
        const { data: sent } = await supabase.from('notifications')
          .select('verb, entity_id')
          .eq('user_id', userId)
          .like('verb', 'training.%');
        const seen = new Set((sent ?? []).map((n) => `${n.verb}|${n.entity_id}`));
        const fresh = candidates.filter((c) => !seen.has(`${c.verb}|${c.entity_id}`));
        if (!fresh.length) return;

        await supabase.from('notifications').insert(fresh.map((c) => ({
          company_id: companyId, user_id: userId,
          verb: c.verb, entity_type: 'training', entity_id: c.entity_id,
          label: c.label, href: c.href,
        })));
      } catch {
        // best-effort — never surface sweep failures
      }
    })();
  }, [supabase, session, companyId, userId, isAdmin]);
}
