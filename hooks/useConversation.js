'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { notify } from '@/lib/notify';
import { extractMentions } from '@/lib/mentions';

// Primary delivery is a Supabase Realtime subscription (migration 0038 —
// Postgres Changes enforce each subscriber's RLS, so the membership
// policies from 0035/0037 carry over to push). The poll survives only as a
// slow safety net for dropped sockets / anything the subscription misses.
const FALLBACK_POLL_MS = 45000;

// One open conversation's messages + membership + send/read actions.
export function useConversation(conversationId, session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [conversation, setConversation] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberStates, setMemberStates] = useState([]); // [{user_id, last_read_at, users}] — drives read receipts
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sending, setSending] = useState(false);
  // Roster snapshot for the realtime handler — lets it decorate incoming
  // rows with sender info without re-subscribing every time members change.
  const membersRef = useRef([]);
  useEffect(() => { membersRef.current = members; }, [members]);

  const refresh = useCallback(async () => {
    if (!supabase || !conversationId) return;
    setLoadError(null);
    const [convoRes, msgRes] = await Promise.all([
      supabase
        .from('conversations')
        .select('*, conversation_members(user_id, last_read_at, users(id, full_name, email))')
        .eq('id', conversationId)
        .single(),
      supabase
        .from('messages')
        .select('*, users(id, full_name, email)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500),
    ]);
    if (convoRes.error) { setLoadError(convoRes.error.message); return; }
    setConversation(convoRes.data);
    const states = convoRes.data?.conversation_members ?? [];
    setMemberStates(states);
    setMembers(states.map((m) => m.users).filter(Boolean));
    if (!msgRes.error) setMessages(msgRes.data ?? []);
    else setLoadError(msgRes.error.message);
  }, [supabase, conversationId]);

  useEffect(() => {
    if (!supabase || !session || !conversationId) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [supabase, session, conversationId, refresh]);

  const markRead = useCallback(async () => {
    if (!supabase || !conversationId || !userId) return;
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
  }, [supabase, conversationId, userId]);

  // Opening a conversation marks it read (clears its unread badge in
  // useConversations' list) — separate from the mark-read-on-send inside
  // sendMessage below.
  useEffect(() => {
    if (!supabase || !session || !conversationId) return;
    void markRead();
  }, [supabase, session, conversationId, markRead]);

  // ── Realtime: live message inserts + live read-receipt updates ─────────
  useEffect(() => {
    if (!supabase || !session || !conversationId) return;

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new;
          // Realtime payloads are raw rows (no joined users relation) —
          // decorate from the member roster (ref, so this handler doesn't
          // need members in the effect deps and never churns the socket);
          // the sender must be a member to have passed the insert policy.
          const sender = membersRef.current.find((m) => m.id === row.sender_id) ?? null;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, users: sender }]
          );
          // Reading it live — don't let the open conversation accrue unread.
          if (row.sender_id !== userId) void markRead();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new;
          setMemberStates((prev) =>
            prev.map((s) => (s.user_id === row.user_id ? { ...s, last_read_at: row.last_read_at } : s))
          );
        }
      )
      .subscribe((status) => {
        // Cover the gap between the initial fetch and the socket coming up.
        if (status === 'SUBSCRIBED') void refresh();
      });

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, session, conversationId, userId, markRead, refresh]);

  // Slow fallback poll — safety net only (see FALLBACK_POLL_MS above).
  useEffect(() => {
    if (!supabase || !conversationId) return;
    const id = setInterval(() => { void refresh(); }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [supabase, conversationId, refresh]);

  // Send a text message, a file, or both. The file goes to the private
  // message-attachments bucket under <conversationId>/<uuid>-<name>, which
  // is what the storage RLS keys membership off (migration 0039).
  const sendMessage = useCallback(async (body, file = null) => {
    const text = (body ?? '').trim();
    if (!supabase || !conversationId || !companyId || !userId || (!text && !file)) return;
    setSending(true);
    try {
      let attachment = {};
      if (file) {
        const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
        const path = `${conversationId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('message-attachments').upload(path, file);
        if (upErr) throw upErr;
        attachment = {
          attachment_path: path,
          attachment_name: file.name,
          attachment_size: file.size,
          attachment_type: file.type || null,
        };
      }

      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId, company_id: companyId, sender_id: userId,
        body: text || null, ...attachment,
      });
      if (error) throw error;
      await Promise.all([
        supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId),
        markRead(),
      ]);
      await refresh();

      // Best-effort pings — reuses the existing notification pipeline
      // (lib/notify.js), never blocks/throws on failure. @mentioned members
      // get a distinct, louder verb; everyone else the regular one.
      const senderLabel = user?.full_name || user?.email || 'Someone';
      const mentionedIds = new Set(extractMentions(text, members).map((m) => m.id));
      const recipients = members.filter((m) => m.id !== userId);
      for (const r of recipients) {
        const mentioned = mentionedIds.has(r.id);
        await notify(supabase, {
          companyId, userId: r.id,
          verb: mentioned ? 'message.mentioned' : 'message.received',
          entityType: 'conversation', entityId: conversationId,
          label: mentioned
            ? `${senderLabel} mentioned you${conversation?.name ? ` in ${conversation.name}` : ''}`
            : conversation?.name
              ? `${senderLabel} in ${conversation.name}`
              : `New message from ${senderLabel}`,
          href: `/messages?c=${conversationId}`,
        });
      }
    } finally {
      setSending(false);
    }
  }, [supabase, conversationId, companyId, userId, members, user, conversation, markRead, refresh]);

  return { conversation, members, memberStates, messages, loading, loadError, sending, sendMessage, markRead, refresh };
}
