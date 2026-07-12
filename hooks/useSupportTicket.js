'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { getSupportSnapshot, getSupportServerSnapshot, subscribeSupport, writeSupport, newSupportId } from '@/lib/supportLocalStore';

export function useSupportTicket(ticketId, session, company) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const localData = useSyncExternalStore(subscribeSupport, getSupportSnapshot, getSupportServerSnapshot);

  const [remoteTicket,   setRemoteTicket]   = useState(null);
  const [remoteComments, setRemoteComments] = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [projectAssets,  setProjectAssets]  = useState([]);
  const [priorTickets,   setPriorTickets]   = useState([]);
  const [bomSnapshot,    setBomSnapshot]    = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !ticketId) return;
    setLoading(true);
    const [tRes, cRes, pRes] = await Promise.all([
      supabase.from('support_tickets')
        .select('*, crm_accounts(name), psa_projects(name, quote_id, crm_account_id)')
        .eq('id', ticketId).single(),
      supabase.from('support_comments').select('*, users(full_name, email)').eq('ticket_id', ticketId).order('created_at'),
      companyId ? supabase.from('psa_projects').select('id, name, crm_account_id').eq('company_id', companyId).order('name') : Promise.resolve({ data: [] }),
    ]);
    setRemoteTicket(tRes.data ?? null);
    setRemoteComments(cRes.data ?? []);
    setProjects(pRes.data ?? []);

    // The support bundle — everything a tech needs to know what they're
    // looking at: the project's full asset details, the account's prior
    // ticket history, and the as-sold parts list from the accepted proposal.
    const projectId = tRes.data?.project_id;
    const accountId = tRes.data?.account_id;
    const quoteId = tRes.data?.psa_projects?.quote_id;
    const [aRes, priorRes, quoteRes] = await Promise.all([
      projectId
        ? supabase.from('assets').select('id, name, asset_type, serial_number, location, install_date, notes').eq('project_id', projectId).order('name')
        : Promise.resolve({ data: [] }),
      accountId
        ? supabase.from('support_tickets')
            .select('id, title, status, priority, created_at')
            .eq('account_id', accountId).neq('id', ticketId)
            .order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      quoteId
        ? supabase.from('saved_projects').select('bom_snapshot').eq('id', quoteId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setProjectAssets(aRes.data ?? []);
    setPriorTickets(priorRes.data ?? []);
    setBomSnapshot(quoteRes.data?.bom_snapshot ?? null);
    setLoading(false);
  }, [supabase, ticketId, companyId]);

  useEffect(() => {
    if (!ticketId || !supabase || !session) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, ticketId, refresh]);

  const ticket   = supabase ? remoteTicket   : (localData.tickets.find((t) => t.id === ticketId) ?? null);
  const comments = supabase ? remoteComments : localData.comments.filter((c) => c.ticket_id === ticketId).sort((a, b) => a.created_at?.localeCompare(b.created_at));

  const updateTicket = useCallback(async (data) => {
    const now = new Date().toISOString();
    const extra = data.status === 'resolved' ? { resolved_at: now } : {};
    if (!supabase) {
      writeSupport((s) => ({ ...s, tickets: s.tickets.map((t) => t.id === ticketId ? { ...t, ...data, ...extra, updated_at: now } : t) }));
      return;
    }
    const { error } = await supabase.from('support_tickets').update({ ...data, ...extra, updated_at: now }).eq('id', ticketId);
    if (error) throw error;
    await refresh();
  }, [supabase, ticketId, refresh]);

  const addComment = useCallback(async (body, userId) => {
    const now = new Date().toISOString();
    if (!supabase) {
      const c = { id: newSupportId(), ticket_id: ticketId, user_id: userId || 'local', body, created_at: now };
      writeSupport((s) => ({ ...s, comments: [...s.comments, c] }));
      return c;
    }
    const { data: c, error } = await supabase
      .from('support_comments')
      .insert({ ticket_id: ticketId, user_id: userId, body })
      .select('*, users(full_name, email)')
      .single();
    if (error) throw error;
    await refresh();
    return c;
  }, [supabase, ticketId, refresh]);

  const deleteComment = useCallback(async (id) => {
    if (!supabase) {
      writeSupport((s) => ({ ...s, comments: s.comments.filter((c) => c.id !== id) }));
      return;
    }
    const { error } = await supabase.from('support_comments').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { ticket, comments, projects, projectAssets, priorTickets, bomSnapshot, loading, refresh, updateTicket, addComment, deleteComment };
}
