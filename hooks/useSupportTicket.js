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
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !ticketId) return;
    setLoading(true);
    const [tRes, cRes, pRes] = await Promise.all([
      supabase.from('support_tickets').select('*, crm_accounts(name), psa_projects(name)').eq('id', ticketId).single(),
      supabase.from('support_comments').select('*, users(full_name, email)').eq('ticket_id', ticketId).order('created_at'),
      companyId ? supabase.from('psa_projects').select('id, name').eq('company_id', companyId).order('name') : Promise.resolve({ data: [] }),
    ]);
    setRemoteTicket(tRes.data ?? null);
    setRemoteComments(cRes.data ?? []);
    setProjects(pRes.data ?? []);

    const projectId = tRes.data?.project_id;
    if (projectId) {
      const { data: aData } = await supabase.from('assets').select('id, name').eq('project_id', projectId).order('name');
      setProjectAssets(aData ?? []);
    } else {
      setProjectAssets([]);
    }
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

  return { ticket, comments, projects, projectAssets, loading, refresh, updateTicket, addComment, deleteComment };
}
