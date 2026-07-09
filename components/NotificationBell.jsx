'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function fmtDue(iso) {
  const due = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, danger: true };
  if (days === 0) return { label: 'Due today', danger: true };
  if (days === 1) return { label: 'Due tomorrow', danger: false };
  return { label: `Due in ${days}d`, danger: false };
}

export default function NotificationBell() {
  const { configured, session, company, user } = useSession();
  const { notifications, dueTasks, unreadCount, loading, markRead, markAllRead } = useNotifications(session, company, user);
  const [open, setOpen] = useState(false);

  if (!configured || !session) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full top-0 z-50 ml-2 max-h-[28rem] w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              {notifications.some((n) => !n.is_read) && (
                <button type="button" onClick={markAllRead} className="text-xs font-medium text-blue-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>

            {loading && notifications.length === 0 && dueTasks.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">Loading…</p>
            ) : notifications.length === 0 && dueTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <CheckCircle2 size={20} className="text-slate-200" />
                <p className="text-xs text-slate-400">You&rsquo;re all caught up.</p>
              </div>
            ) : (
              <>
                {dueTasks.length > 0 && (
                  <div className="border-b border-slate-100 py-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Due soon</p>
                    {dueTasks.map((t) => {
                      const due = fmtDue(t.due_date);
                      return (
                        <Link
                          key={t.id}
                          href={`/projects/${t.project_id}`}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <AlertTriangle size={13} className={cn('mt-0.5 shrink-0', due.danger ? 'text-red-500' : 'text-amber-500')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-slate-700">{t.title}</span>
                            <span className="block text-[10px] text-slate-400">
                              {t.psa_projects?.name ?? 'Project'} · <span className={due.danger ? 'font-medium text-red-500' : ''}>{due.label}</span>
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {notifications.length > 0 && (
                  <div className="py-1">
                    {notifications.map((n) => {
                      const body = (
                        <>
                          <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-blue-500')} />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-xs', n.is_read ? 'text-slate-500' : 'font-medium text-slate-700')}>{n.label}</span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Clock size={9} /> {fmtRelative(n.created_at)}
                            </span>
                          </span>
                        </>
                      );
                      const className = 'flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 w-full';
                      return n.href ? (
                        <Link key={n.id} href={n.href} onClick={() => { markRead(n.id); setOpen(false); }} className={className}>
                          {body}
                        </Link>
                      ) : (
                        <button key={n.id} type="button" onClick={() => markRead(n.id)} className={className}>
                          {body}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
