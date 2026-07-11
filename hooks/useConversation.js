'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { notify } from '@/lib/notify';

// No real-time infrastructure exists in this app yet (see the Message
// Center plan doc) — a short poll while a conversation is open, plus a
// manual refresh button in the UI, covers the gap until a later tier adds
// Supabase Realtime.
const POLL_MS = 6000;

// One open conversation's messages + membership + send/read actions.
export function useConversation(conversationId, session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [conversation, setConversation] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sending, setSending] = useState(false);

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
    setMembers((convoRes.data?.conversation_members ?? []).map((m) => m.users).filter(Boolean));
    if (!msgRes.error) setMessages(msgRes.data ?? []);
    else setLoadError(msgRes.error.message);
  }, [supabase, conversationId]);

  useEffect(() => {
    if (!supabase || !session || !conversationId) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [supabase, session, conversationId, refresh]);

  useEffect(() => {
    if (!supabase || !conversationId) return;
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [supabase, conversationId, refresh]);

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

  const sendMessage = useCallback(async (body) => {
    const text = body.trim();
    if (!supabase || !conversationId || !companyId || !userId || !text) return;
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversationId, company_id: companyId, sender_id: userId, body: text,
      });
      if (error) throw error;
      await Promise.all([
        supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId),
        markRead(),
      ]);
      await refresh();

      // Best-effort "new message" ping — reuses the existing notification
      // pipeline (lib/notify.js), never blocks/throws on failure.
      const senderLabel = user?.full_name || user?.email || 'Someone';
      const label = conversation?.name ? `${senderLabel} in ${conversation.name}` : `New message from ${senderLabel}`;
      const recipients = members.filter((m) => m.id !== userId);
      for (const r of recipients) {
        await notify(supabase, {
          companyId, userId: r.id, verb: 'message.received',
          entityType: 'conversation', entityId: conversationId,
          label, href: `/messages?c=${conversationId}`,
        });
      }
    } finally {
      setSending(false);
    }
  }, [supabase, conversationId, companyId, userId, members, user, conversation, markRead, refresh]);

  return { conversation, members, messages, loading, loadError, sending, sendMessage, markRead, refresh };
}
