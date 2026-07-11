'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const LIMIT = 30;
const DUE_SOON_DAYS = 3;

// Stored notifications (assigned-to-me, CO approved, ticket assigned) plus a
// virtual "due soon / overdue" list computed live from my open tasks — no
// cron/scheduled job exists in this app, so due-date reminders can't be
// pre-generated; they're just queried fresh each time the bell opens.
export function useNotifications(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [notifications, setNotifications] = useState([]);
  const [dueTasks, setDueTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    const soonCutoff = new Date();
    soonCutoff.setDate(soonCutoff.getDate() + DUE_SOON_DAYS);

    const [notifRes, taskRes] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(LIMIT),
      supabase.from('psa_tasks')
        .select('id, title, due_date, status, project_id, psa_projects(name)')
        .eq('assignee_id', userId)
        .neq('status', 'done')
        .not('due_date', 'is', null)
        .lte('due_date', soonCutoff.toISOString().slice(0, 10))
        .order('due_date'),
    ]);
    if (!notifRes.error) setNotifications(notifRes.data ?? []);
    if (!taskRes.error) setDueTasks(taskRes.data ?? []);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase || !session || !companyId || !userId) return;
    void refresh();
  }, [supabase, session, companyId, userId, refresh]);

  // Live bell: new notifications for me push instantly (migration 0038 put
  // notifications in the realtime publication; its RLS is user-scoped, but
  // the explicit filter avoids waking every client for every insert).
  useEffect(() => {
    if (!supabase || !session || !userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { void refresh(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, session, userId, refresh]);

  const markRead = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    await refresh();
  }, [supabase, refresh]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !userId) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    await refresh();
  }, [supabase, userId, refresh]);

  const unreadCount = notifications.filter((n) => !n.is_read).length + dueTasks.length;

  return { notifications, dueTasks, unreadCount, loading, refresh, markRead, markAllRead };
}
