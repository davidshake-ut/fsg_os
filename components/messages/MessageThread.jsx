'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, RefreshCw, Loader2, Hash, FolderKanban, MessageSquare, Paperclip, X, FileText, Download } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';
import { toneClasses } from '@/lib/statusColors';
import { splitMentions } from '@/lib/mentions';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function headerName(conversation, currentUserId) {
  if (!conversation) return '';
  if (conversation.type === 'dm') {
    const other = (conversation.conversation_members ?? []).map((m) => m.users).find((u) => u?.id !== currentUserId);
    return other?.full_name || other?.email || 'Direct Message';
  }
  return conversation.name || 'Untitled channel';
}

// Message body with @mentions highlighted (lib/mentions.js does the parsing).
function MessageBody({ body, members }) {
  if (!body) return null;
  const segments = splitMentions(body, members);
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-800">
      {segments.map((s, i) =>
        s.mention
          ? <span key={i} className="rounded bg-[var(--brand,#2563eb)]/10 px-0.5 font-semibold text-[var(--brand,#2563eb)]">{s.text}</span>
          : <span key={i}>{s.text}</span>
      )}
    </p>
  );
}

// Attachment display. The bucket is private, so every render/download goes
// through a short-lived signed URL — inline for images, click-to-open for
// everything else.
function Attachment({ message }) {
  const supabase = getSupabase();
  const isImage = (message.attachment_type ?? '').startsWith('image/');
  const [imgUrl, setImgUrl] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!supabase || !isImage || !message.attachment_path) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.storage.from('message-attachments').createSignedUrl(message.attachment_path, 3600);
      if (!cancelled && data?.signedUrl) setImgUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [supabase, isImage, message.attachment_path]);

  const open = async () => {
    if (!supabase || opening) return;
    setOpening(true);
    try {
      const { data } = await supabase.storage.from('message-attachments').createSignedUrl(message.attachment_path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    } finally {
      setOpening(false);
    }
  };

  if (isImage && imgUrl) {
    return (
      <button type="button" onClick={open} className="mt-1 block" title={message.attachment_name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgUrl} alt={message.attachment_name ?? 'Attachment'} className="max-h-64 max-w-full rounded-lg border border-slate-200" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <FileText size={16} className="shrink-0 text-slate-400" />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-700">{message.attachment_name}</span>
        <span className="text-[10px] text-slate-400">{fmtBytes(message.attachment_size)}</span>
      </span>
      {opening ? <Loader2 size={13} className="ml-1 shrink-0 animate-spin text-slate-400" /> : <Download size={13} className="ml-1 shrink-0 text-slate-300" />}
    </button>
  );
}

// Read receipts: everyone (other than yourself) whose last_read_at is at or
// past the newest message's timestamp has "seen" the thread as it stands.
function SeenBy({ memberStates, messages, currentUserId }) {
  const last = messages[messages.length - 1];
  if (!last) return null;
  const seen = (memberStates ?? []).filter(
    (s) =>
      s.user_id !== currentUserId &&
      s.users &&
      s.last_read_at &&
      new Date(s.last_read_at) >= new Date(last.created_at)
  );
  if (seen.length === 0) return null;
  return (
    <div className="flex items-center justify-end gap-1 pr-1">
      <span className="text-[10px] text-slate-400">Seen by</span>
      <div className="flex">
        {seen.slice(0, 5).map((s) => (
          <span
            key={s.user_id}
            title={s.users.full_name || s.users.email}
            className="-ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-600 ring-1 ring-white first:ml-0"
          >
            {initials(s.users.full_name, s.users.email)}
          </span>
        ))}
      </div>
      {seen.length > 5 && <span className="text-[10px] text-slate-400">+{seen.length - 5}</span>}
    </div>
  );
}

// The partial "@toke" being typed at the caret, or null.
function mentionTokenAt(text, caret) {
  const upToCaret = text.slice(0, caret);
  const match = upToCaret.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return { partial: match[2], start: caret - match[2].length - 1 };
}

export default function MessageThread({ conversation, members, memberStates, messages, currentUserId, onSend, sending, onRefresh, loading }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null); // { partial, start }
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const mentionMatches = mentionQuery
    ? members
        .filter((m) => m.id !== currentUserId)
        .filter((m) => {
          const q = mentionQuery.partial.toLowerCase();
          return !q || (m.full_name || '').toLowerCase().startsWith(q) || (m.email || '').toLowerCase().startsWith(q);
        })
        .slice(0, 6)
    : [];

  const updateBody = (value, caret) => {
    setBody(value);
    const token = caret != null ? mentionTokenAt(value, caret) : null;
    setMentionQuery(token);
    setMentionIndex(0);
  };

  const insertMention = (member) => {
    if (!mentionQuery) return;
    const name = member.full_name || member.email;
    const caretEnd = mentionQuery.start + mentionQuery.partial.length + 1;
    const next = body.slice(0, mentionQuery.start) + '@' + name + ' ' + body.slice(caretEnd);
    setBody(next);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const pickFile = (f) => {
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`"${f.name}" is over the 10 MB limit.`);
      return;
    }
    setFile(f);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text && !file) return;
    setBody('');
    setFile(null);
    setMentionQuery(null);
    await onSend(text, file);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(e);
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
                  <MessageBody body={m.body} members={members} />
                  {m.attachment_path && <Attachment message={m} />}
                </div>
              </div>
            </div>
          );
        })}
        <SeenBy memberStates={memberStates} messages={messages} currentUserId={currentUserId} />
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="relative shrink-0 border-t border-slate-100 px-5 py-3">
        {mentionQuery && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-5 z-20 mb-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {mentionMatches.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                  i === mentionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                  {initials(m.full_name, m.email)}
                </span>
                <span className="truncate text-sm text-slate-700">{m.full_name || m.email}</span>
              </button>
            ))}
          </div>
        )}

        {(file || fileError) && (
          <div className="mb-2 flex items-center gap-2">
            {file && (
              <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                <Paperclip size={12} className="shrink-0 text-slate-400" />
                <span className="max-w-[240px] truncate font-medium">{file.name}</span>
                <span className="text-slate-400">{fmtBytes(file.size)}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="rounded p-0.5 text-slate-300 hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            )}
            {fileError && <span className="text-xs text-red-600">{fileError}</span>}
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach a file"
            aria-label="Attach a file"
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => updateBody(e.target.value, e.target.selectionStart)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message… @ to mention, Ctrl+Enter to send"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <Button type="submit" disabled={sending || (!body.trim() && !file)}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
      </form>
    </div>
  );
}
