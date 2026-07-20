'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { getSupportSnapshot, getSupportServerSnapshot, subscribeSupport, writeSupport, newSupportId } from '@/lib/supportLocalStore';
import { logActivity } from '@/lib/activityLog';
import { notify } from '@/lib/notify';
import { runAutomations } from '@/lib/automations';

const PAGE_SIZE = 100;

export function useSupportTickets(session, company, user) {
  const supabase = getSupabase();
  const localData = useSyncExternalStore(subscribeSupport, getSupportSnapshot, getSupportServerSnapshot);
  const companyId = company?.id;
  const userId    = user?.id;

  const [remoteTickets, setRemoteTickets] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error, count } = await supabase
      .from('support_tickets')
      .select('*, crm_accounts(name), assignee:users!support_tickets_assigned_to_fkey(full_name, email)', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(0, limit - 1);
    setLoadError(error?.message ?? null);
    if (!error) {
      setRemoteTickets(data ?? []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [supabase, companyId, limit]);

  const loadMore = useCallback(() => setLimit((l) => l + PAGE_SIZE), []);
  const hasMore = !!supabase && totalCount > limit;

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, refresh]);

  const tickets = supabase ? remoteTickets : localData.tickets;

  // Company roster for the assignee picker in NewTicketModal.
  useEffect(() => {
    if (!supabase || !companyId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('users').select('id, full_name, email').eq('company_id', companyId).order('full_name');
      if (!cancelled) setMembers(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [supabase, companyId]);

  const createTicket = useCallback(async (data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      const t = { id: newSupportId(), company_id: 'local', ...data, created_at: now, updated_at: now };
      writeSupport((s) => ({ ...s, tickets: [t, ...s.tickets] }));
      return t;
    }
    const { data: t, error } = await supabase
      .from('support_tickets')
      .insert({ company_id: companyId, created_by: userId, ...data })
      .select('*, crm_accounts(name)')
      .single();
    if (error) throw error;
    await logActivity(supabase, {
      companyId, actorId: userId,
      verb: 'ticket.created', entityType: 'ticket', entityId: t.id,
      label: `Ticket opened: ${t.title}`,
    });
    if (t.assigned_to && t.assigned_to !== userId) {
      await notify(supabase, {
        companyId, userId: t.assigned_to,
        verb: 'ticket.assigned', entityType: 'ticket', entityId: t.id,
        label: `Ticket assigned to you: ${t.title}`,
        href: `/support/${t.id}`,
      });
    }
    await runAutomations(supabase, {
      companyId, triggerType: 'ticket.created',
      entity: t,
    });
    await refresh();
    return t;
  }, [supabase, companyId, userId, refresh]);

  const updateTicket = useCallback(async (id, data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      writeSupport((s) => ({ ...s, tickets: s.tickets.map((t) => t.id === id ? { ...t, ...data, updated_at: now } : t) }));
      return;
    }
    const { error } = await supabase.from('support_tickets').update({ ...data, updated_at: now }).eq('id', id);
    if (error) throw error;
    const ticket = tickets.find((t) => t.id === id);
    if (data.assigned_to) {
      if (ticket && ticket.assigned_to !== data.assigned_to) {
        await notify(supabase, {
          companyId, userId: data.assigned_to,
          verb: 'ticket.assigned', entityType: 'ticket', entityId: id,
          label: `Ticket assigned to you: ${ticket.title}`,
          href: `/support/${id}`,
        });
      }
    }
    if (data.status) {
      await runAutomations(supabase, {
        companyId, triggerType: 'ticket.status_changed',
        entity: { ...ticket, ...data, id },
      });
    }
    await refresh();
  }, [supabase, refresh, tickets, companyId]);

  const deleteTicket = useCallback(async (id) => {
    if (!supabase) {
      writeSupport((s) => ({
        ...s,
        tickets:  s.tickets.filter((t) => t.id !== id),
        comments: s.comments.filter((c) => c.ticket_id !== id),
      }));
      return;
    }
    const { error } = await supabase.from('support_tickets').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { tickets, members, loading, loadError, hasMore, totalCount, loadMore, refresh, createTicket, updateTicket, deleteTicket };
}
