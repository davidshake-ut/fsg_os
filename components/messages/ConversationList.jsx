'use client';

import { Plus, RefreshCw, Hash, FolderKanban, Loader2, Search } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { toneClasses, tileClasses } from '@/lib/statusColors';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function displayInfo(convo, currentUserId) {
  if (convo.type === 'dm') {
    const other = (convo.members ?? []).find((m) => m.id !== currentUserId);
    return { name: other?.full_name || other?.email || 'Direct Message', isAvatar: true, avatarSeed: other };
  }
  return { name: convo.name || 'Untitled channel', isAvatar: false };
}

export default function ConversationList({ conversations, activeId, onSelect, currentUserId, loading, onRefresh, onNewConversation, onSearch, searchActive }) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <h1 className="text-sm font-semibold text-slate-900">Messages</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSearch}
            title="Search messages"
            aria-label="Search messages"
            className={cn(
              'rounded-lg p-1.5 hover:bg-slate-100 hover:text-slate-600',
              searchActive ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
            )}
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh"
            aria-label="Refresh conversations"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            onClick={onNewConversation}
            title="New conversation"
            aria-label="New conversation"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {conversations.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <p className="text-xs text-slate-400">No conversations yet. Start one with the + button above.</p>
          </div>
        )}

        {conversations.map((convo) => {
          const info = displayInfo(convo, currentUserId);
          const active = convo.id === activeId;
          const previewBody = convo.lastMessage
            ? (convo.lastMessage.body ?? (convo.lastMessage.attachment_name ? `📎 ${convo.lastMessage.attachment_name}` : ''))
            : null;
          const preview = convo.lastMessage
            ? `${convo.lastMessage.sender_id === currentUserId ? 'You: ' : ''}${previewBody}`
            : 'No messages yet';
          return (
            <button
              key={convo.id}
              type="button"
              onClick={() => onSelect(convo.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                active ? toneClasses('info', { border: false }) : 'hover:bg-slate-50'
              )}
            >
              {info.isAvatar ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {initials(info.avatarSeed?.full_name, info.avatarSeed?.email)}
                </span>
              ) : (
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tileClasses('progress'))}>
                  {convo.type === 'project' ? <FolderKanban size={16} /> : <Hash size={16} />}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', convo.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
                    {info.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(convo.lastMessage?.created_at ?? convo.updated_at)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-xs', convo.unreadCount > 0 ? 'font-semibold text-slate-600' : 'text-slate-400')}>
                    {preview}
                  </span>
                  {convo.unreadCount > 0 && (
                    <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)]">
                      {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
