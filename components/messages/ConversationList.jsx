'use client';

import { useState } from 'react';
import {
  Plus, RefreshCw, Hash, FolderKanban, Loader2, Search,
  Archive, ArchiveRestore, MailPlus, LogOut, ChevronRight,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';
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
  return fmtDateShared(iso);
}

function displayInfo(convo, currentUserId) {
  if (convo.type === 'dm') {
    const other = (convo.members ?? []).find((m) => m.id !== currentUserId);
    return { name: other?.full_name || other?.email || 'Direct Message', isAvatar: true, avatarSeed: other };
  }
  return { name: convo.name || 'Untitled channel', isAvatar: false };
}

function ConversationRow({ convo, currentUserId, active, onSelect, onArchive, onMarkUnread, onLeave }) {
  const info = displayInfo(convo, currentUserId);
  const isUnread = convo.unreadCount > 0 || convo.markedUnread;
  const previewBody = convo.lastMessage
    ? (convo.lastMessage.body ?? (convo.lastMessage.attachment_name ? `📎 ${convo.lastMessage.attachment_name}` : ''))
    : null;
  const preview = convo.lastMessage
    ? `${convo.lastMessage.sender_id === currentUserId ? 'You: ' : ''}${previewBody}`
    : 'No messages yet';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(convo.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(convo.id); } }}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors',
        // Active row: colors come from the tone (solid brand + light ink in
        // bold mode, pastel + dark ink in muted) — inner text INHERITS so it
        // stays readable on either background.
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
          <span
            className={cn(
              'truncate text-sm',
              isUnread ? 'font-bold' : 'font-medium',
              active ? 'text-inherit' : isUnread ? 'text-slate-900' : 'text-slate-700'
            )}
          >
            {info.name}
          </span>
          <span className={cn('shrink-0 text-[10px]', active ? 'text-inherit opacity-70' : 'text-slate-400')}>
            {timeAgo(convo.lastMessage?.created_at ?? convo.updated_at)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-xs',
              active
                ? cn('text-inherit', isUnread ? 'opacity-90 font-semibold' : 'opacity-70')
                : isUnread ? 'font-semibold text-slate-600' : 'text-slate-400'
            )}
          >
            {preview}
          </span>
          {convo.unreadCount > 0 ? (
            <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)]">
              {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
            </span>
          ) : convo.markedUnread ? (
            <span
              title="Marked unread"
              className="h-2 w-2 shrink-0 rounded-full [background:var(--ui-button-bg,var(--brand,#2563eb))]"
            />
          ) : null}
        </span>
      </span>

      {/* Hover actions */}
      <span className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!isUnread && onMarkUnread && (
          <button
            type="button"
            title="Mark as unread (save for later)"
            onClick={(e) => { e.stopPropagation(); onMarkUnread(convo); }}
            className={cn('rounded p-0.5', active ? 'text-inherit opacity-70 hover:opacity-100' : 'text-slate-300 hover:text-blue-500')}
          >
            <MailPlus size={12} />
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            title={convo.archived ? 'Restore from Archived' : 'Archive (moves to your Archived folder)'}
            onClick={(e) => { e.stopPropagation(); onArchive(convo, !convo.archived); }}
            className={cn('rounded p-0.5', active ? 'text-inherit opacity-70 hover:opacity-100' : 'text-slate-300 hover:text-blue-500')}
          >
            {convo.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
        )}
        {convo.type !== 'dm' && onLeave && (
          <button
            type="button"
            title="Leave this channel"
            onClick={(e) => { e.stopPropagation(); onLeave(convo); }}
            className={cn('rounded p-0.5', active ? 'text-inherit opacity-70 hover:opacity-100' : 'text-slate-300 hover:text-red-500')}
          >
            <LogOut size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

function Section({ label, count, children }) {
  if (count === 0) return null;
  return (
    <div className="mb-1">
      <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label} <span className="font-medium opacity-70">{count}</span>
      </p>
      {children}
    </div>
  );
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  currentUserId,
  loading,
  onRefresh,
  onNewConversation,
  onSearch,
  searchActive,
  onArchive,
  onMarkUnread,
  onLeave,
}) {
  const [showArchived, setShowArchived] = useState(false);

  const activeList = conversations.filter((c) => !c.archived);
  const channels = activeList.filter((c) => c.type !== 'dm');
  const dms = activeList.filter((c) => c.type === 'dm');
  const archived = conversations.filter((c) => c.archived);

  const rowProps = { currentUserId, onSelect, onArchive, onMarkUnread, onLeave };

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

        <Section label="Channels" count={channels.length}>
          {channels.map((c) => (
            <ConversationRow key={c.id} convo={c} active={c.id === activeId} {...rowProps} />
          ))}
        </Section>

        <Section label="Direct Messages" count={dms.length}>
          {dms.map((c) => (
            <ConversationRow key={c.id} convo={c} active={c.id === activeId} {...rowProps} />
          ))}
        </Section>

        {archived.length > 0 && (
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-1 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600"
            >
              <ChevronRight size={11} className={cn('transition-transform', showArchived && 'rotate-90')} />
              Archived <span className="font-medium opacity-70">{archived.length}</span>
            </button>
            {showArchived &&
              archived.map((c) => (
                <ConversationRow key={c.id} convo={c} active={c.id === activeId} {...rowProps} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
