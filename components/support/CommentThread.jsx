'use client';

import { useState } from 'react';
import { Send, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return fmtDateShared(iso);
}

export default function CommentThread({ comments, onAdd, onDelete, currentUserId }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onAdd(trimmed, currentUserId);
      setBody('');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {comments.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
          <MessageSquare size={24} className="text-slate-300" />
          <p className="text-sm">No comments yet — add the first update below.</p>
        </div>
      )}

      <div className="space-y-3">
        {comments.map((c) => {
          const author = c.users?.full_name || c.users?.email || 'Team';
          const isOwn  = c.user_id === currentUserId;
          return (
            <div key={c.id} className="group flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                {author.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="rounded-xl rounded-tl-sm bg-slate-50 border border-slate-100 px-4 py-2.5">
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.body}</p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {author} · {timeAgo(c.created_at)}
                </p>
              </div>
              {isOwn && (
                <button
                  onClick={() => onDelete(c.id)}
                  className="mt-1 shrink-0 rounded p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2 pt-2 border-t border-slate-100">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(e); }}
          placeholder="Add a comment… (Ctrl+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>
          <Send size={14} />
        </Button>
      </form>
    </div>
  );
}
