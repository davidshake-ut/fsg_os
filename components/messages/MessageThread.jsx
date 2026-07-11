'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, RefreshCw, Loader2, Hash, FolderKanban, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';
import { toneClasses } from '@/lib/statusColors';

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function headerName(conversation, currentUserId) {
  if (!conversation) return '';
  if (conversation.type === 'dm') {
    const other = (conversation.conversation_members ?? []).map((m) => m.users).find((u) => u?.id !== currentUserId);
    return other?.full_name || other?.email || 'Direct Message';
  }
  return conversation.name || 'Untitled channel';
}

export default function MessageThread({ conversation, members, messages, currentUserId, onSend, sending, onRefresh, loading }) {
  const [body, setBody] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    await onSend(text);
  };

  if (!conversation) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 text-slate-400">
        <MessageSquare size={28} className="text-slate-200" />
        <p className="text-sm">Pick a conversation, or start a new one.</p>
      </div>
    );
  }

  const otherMembers = members.filter((m) => m.id !== currentUserId);

  return (
    <div className="flex h-full flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {conversation.type !== 'dm' && (
            conversation.type === 'project'
              ? <FolderKanban size={15} className="shrink-0 text-slate-400" />
              : <Hash size={15} className="shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{headerName(conversation, currentUserId)}</p>
            {conversation.type !== 'dm' && (
              <p className="truncate text-xs text-slate-400">
                {members.length} member{members.length !== 1 ? 's' : ''} · {otherMembers.map((m) => m.full_name || m.email).join(', ')}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh messages"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-slate-400">
            <p className="text-sm">No messages yet — say hello.</p>
          </div>
        )}
        {messages.map((m) => {
          const isOwn = m.sender_id === currentUserId;
          const author = m.users?.full_name || m.users?.email || 'Former member';
          return (
            <div key={m.id} className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                {initials(m.users?.full_name, m.users?.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-800">{author}</span>
                  <span className="text-[11px] text-slate-400">{timeLabel(m.created_at)}</span>
                </p>
                <div className={cn('mt-0.5 inline-block max-w-full rounded-xl rounded-tl-sm px-3.5 py-2', isOwn ? toneClasses('info', { border: false }) : 'bg-slate-50')}>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex shrink-0 items-end gap-2 border-t border-slate-100 px-5 py-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(e); }}
          placeholder="Write a message… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <Button type="submit" disabled={sending || !body.trim()}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </form>
    </div>
  );
}
