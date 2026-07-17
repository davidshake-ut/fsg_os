'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// List updates arrive live via a Realtime subscription on message inserts
// (RLS-scoped to the caller's conversations, migration 0038); a slow poll
// remains as a safety net for dropped sockets and membership changes that
// don't produce a message event.
const FALLBACK_POLL_MS = 60000;

// Conversation list — DMs, group channels, and project channels the
// current user belongs to (RLS already scopes `conversations` to rows
// where public.is_conversation_member(id) is true, see migration 0035).
export function useConversations(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // `silent` skips the loading flag — used by realtime/poll-triggered
  // background refreshes so the list doesn't flash a spinner mid-use.
  // (Button onClick passes a MouseEvent as the arg; that has no `silent`.)
  const refresh = useCallback(async (opts = {}) => {
    if (!supabase || !companyId || !userId) return;
    if (!opts.silent) setLoading(true);
    setLoadError(null);

    const { data: convos, error } = await supabase
      .from('conversations')
      .select('*, conversation_members(user_id, last_read_at, archived, marked_unread, users(id, full_name, email))')
      .order('updated_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    const list = convos ?? [];
    const ids = list.map((c) => c.id);

    // Last-message preview per conversation — a plain query + client-side
    // "keep first per conversation_id" rather than a custom RPC, matching
    // this app's general preference for the simplest thing that works.
    const lastByConvo = new Map();
    if (ids.length > 0) {
      const { data: recent } = await supabase
        .from('messages')
        .select('conversation_id, body, sender_id, created_at, attachment_name')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(300);
      for (const m of recent ?? []) {
        if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
      }
    }

    // Unread counts — one small count query per conversation (fine at this
    // scale), since each conversation has a different last_read_at cutoff
    // for *this* user, which PostgREST can't express as a single batched
    // query without a custom RPC.
    const unreadEntries = await Promise.all(
      list.map(async (c) => {
        const mine = (c.conversation_members ?? []).find((m) => m.user_id === userId);
        const since = mine?.last_read_at ?? '1970-01-01T00:00:00Z';
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .gt('created_at', since);
        return [c.id, count ?? 0];
      })
    );
    const unreadMap = new Map(unreadEntries);

    setConversations(
      list.map((c) => {
        const mine = (c.conversation_members ?? []).find((m) => m.user_id === userId);
        return {
          ...c,
          members: (c.conversation_members ?? []).map((m) => m.users).filter(Boolean),
          lastMessage: lastByConvo.get(c.id) ?? null,
          // Super admins can SEE conversations they're not members of (RLS
          // oversight bypass) — but with no membership row there's no
          // last_read_at to compare, so every message would count unread
          // and the row would bold forever. Not a member → nothing unread.
          unreadCount: mine ? unreadMap.get(c.id) ?? 0 : 0,
          archived: mine?.archived ?? false,
          markedUnread: mine?.marked_unread ?? false,
          isMember: !!mine,
        };
      })
    );
    setLoading(false);
  }, [supabase, companyId, userId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  // ── Realtime: any message insert visible to me → refresh the list ──────
  // Debounced so a burst of messages produces one recompute, not N. New
  // conversations without a first message are covered by the fallback poll
  // (the membership row lands after the conversation event, so the
  // conversation INSERT event itself isn't reliably visible to invitees).
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    const channel = supabase
      .channel('conversation-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => { void refresh({ silent: true }); }, 400);
        }
      )
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, session, companyId, refresh]);

  // Slow fallback poll — safety net only (see FALLBACK_POLL_MS above).
  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    const id = setInterval(() => { void refresh({ silent: true }); }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [supabase, session, companyId, refresh]);

  // type: 'dm' | 'group' | 'project'. memberIds excludes the creator (added
  // automatically). For 'dm', reuses an existing 1:1 thread if one already
  // exists instead of spawning a duplicate.
  const createConversation = useCallback(async ({ type, name = null, projectId = null, memberIds }) => {
    if (!supabase || !companyId || !userId) return;

    if (type === 'dm' && memberIds.length === 1) {
      const otherId = memberIds[0];
      const { data: mine } = await supabase
        .from('conversation_members')
        .select('conversation_id, conversations!inner(type)')
        .eq('user_id', userId)
        .eq('conversations.type', 'dm');
      const myDmIds = (mine ?? []).map((r) => r.conversation_id);
      if (myDmIds.length > 0) {
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', otherId)
          .in('conversation_id', myDmIds);
        if (shared && shared.length > 0) {
          await refresh();
          return { id: shared[0].conversation_id, reused: true };
        }
      }
    }

    // Client-generated id, insert WITHOUT `.select()` — the select policy
    // requires membership (is_conversation_member), and the creator isn't
    // seated until the next statement, so an INSERT ... RETURNING here gets
    // its returned row blocked by RLS even though the insert itself passes.
    const convoId = crypto.randomUUID();
    const { error } = await supabase
      .from('conversations')
      .insert({ id: convoId, company_id: companyId, type, name, project_id: projectId, created_by: userId });
    if (error) throw error;
    const convo = { id: convoId, company_id: companyId, type, name, project_id: projectId, created_by: userId };

    // Seat the creator first, in its own statement — the insert policy for
    // every OTHER member relies on the creator already being a visible
    // member (public.is_conversation_member), which a same-statement bulk
    // insert can't see yet (RLS checks use the statement's start snapshot,
    // so rows inserted earlier in the *same* multi-row insert aren't
    // visible to another row's WITH CHECK in that insert).
    const { error: selfErr } = await supabase
      .from('conversation_members')
      .insert({ conversation_id: convo.id, user_id: userId });
    if (selfErr) throw selfErr;

    const others = memberIds.filter((id) => id !== userId);
    if (others.length > 0) {
      const { error: memErr } = await supabase
        .from('conversation_members')
        .insert(others.map((id) => ({ conversation_id: convo.id, user_id: id })));
      if (memErr) throw memErr;
    }

    await refresh();
    return convo;
  }, [supabase, companyId, userId, refresh]);

  // Open (or create) the channel for a PSA project. Project channels are
  // company-discoverable and self-joinable (policies in migration 0037 —
  // projects themselves are company-wide in this app's access model), so
  // anyone opening one either joins the existing channel or creates it,
  // seeded with everyone assigned to the project's tasks.
  const openProjectChannel = useCallback(async (project) => {
    if (!supabase || !companyId || !userId || !project?.id) return;

    const joinExisting = async () => {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id, conversation_members(user_id)')
        .eq('project_id', project.id)
        .eq('type', 'project')
        .maybeSingle();
      if (!existing) return null;
      const isMember = (existing.conversation_members ?? []).some((m) => m.user_id === userId);
      if (!isMember) {
        const { error: joinErr } = await supabase
          .from('conversation_members')
          .insert({ conversation_id: existing.id, user_id: userId });
        if (joinErr) throw joinErr;
      }
      await refresh();
      return { id: existing.id, reused: true };
    };

    const existing = await joinExisting();
    if (existing) return existing;

    const { data: tasks } = await supabase
      .from('psa_tasks')
      .select('assignee_id')
      .eq('project_id', project.id)
      .not('assignee_id', 'is', null);
    const assigneeIds = [...new Set((tasks ?? []).map((t) => t.assignee_id))];

    try {
      return await createConversation({
        type: 'project',
        name: project.name,
        projectId: project.id,
        memberIds: assigneeIds,
      });
    } catch (err) {
      // Unique index on (project_id) where type='project': someone else
      // created the channel between our check and insert — join theirs.
      if (err?.code === '23505') {
        const raced = await joinExisting();
        if (raced) return raced;
      }
      throw err;
    }
  }, [supabase, companyId, userId, createConversation, refresh]);

  // ── Per-member list management (Slack-ish folders) ─────────────────────
  // Archive = my view only (the conversation lives on); mark-unread = save
  // for later (cleared the next time I open it); leave = drop my membership.
  const setArchived = useCallback(async (conversationId, archived) => {
    if (!supabase || !userId) return;
    await supabase
      .from('conversation_members')
      .update({ archived })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    await refresh({ silent: true });
  }, [supabase, userId, refresh]);

  const markUnread = useCallback(async (conversationId) => {
    if (!supabase || !userId) return;
    await supabase
      .from('conversation_members')
      .update({ marked_unread: true })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    await refresh({ silent: true });
  }, [supabase, userId, refresh]);

  const leaveConversation = useCallback(async (conversationId) => {
    if (!supabase || !userId) return;
    await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    await refresh({ silent: true });
  }, [supabase, userId, refresh]);

  return {
    conversations,
    loading,
    loadError,
    refresh,
    createConversation,
    openProjectChannel,
    setArchived,
    markUnread,
    leaveConversation,
  };
}
