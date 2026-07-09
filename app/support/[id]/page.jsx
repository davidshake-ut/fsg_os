'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Building2, Calendar } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useSupportTicket } from '@/hooks/useSupportTicket';
import TicketPriorityBadge, { TicketStatusBadge, STATUS_CONFIG, PRIORITY_CONFIG } from '@/components/support/TicketPriorityBadge';
import CommentThread from '@/components/support/CommentThread';
import { Select } from '@/components/ui/primitives';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function TicketDetail() {
  const { id } = useParams();
  const { session, company, user } = useSession();
  const { ticket, comments, projects, projectAssets, loading, updateTicket, addComment, deleteComment } = useSupportTicket(id, session, company);

  if (loading) {
    return <div className="flex h-64 items-center justify-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={18} /> Loading…</div>;
  }
  if (!ticket) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle size={28} className="text-slate-300" />
        <p className="text-sm">Ticket not found.</p>
        <Link href="/support" className="text-sm text-blue-600 hover:underline">← Back to Support</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/support" className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> Support
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{ticket.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {ticket.crm_accounts?.name && (
                <span className="flex items-center gap-1"><Building2 size={12} /> {ticket.crm_accounts.name}</span>
              )}
              <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(ticket.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TicketPriorityBadge priority={ticket.priority} />
            <Select className="h-8 w-36 text-xs" value={ticket.status}
              onChange={(e) => updateTicket({ status: e.target.value })}>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <option key={val} value={val}>{cfg.label}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-3xl space-y-6">
        {/* Description */}
        {ticket.description && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}

        {/* Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Priority</dt><dd className="mt-0.5"><TicketPriorityBadge priority={ticket.priority} /></dd></div>
            <div><dt className="text-xs text-slate-400">Status</dt><dd className="mt-0.5"><TicketStatusBadge status={ticket.status} /></dd></div>
            {ticket.crm_accounts?.name && (
              <div className="col-span-2"><dt className="text-xs text-slate-400">Account</dt><dd className="mt-0.5 font-medium text-slate-800">{ticket.crm_accounts.name}</dd></div>
            )}
            <div className="col-span-2">
              <dt className="text-xs text-slate-400">Project</dt>
              <dd className="mt-0.5">
                <Select className="h-8 w-full text-xs" value={ticket.project_id ?? ''}
                  onChange={(e) => updateTicket({ project_id: e.target.value || null, asset_id: null })}>
                  <option value="">— none —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </dd>
            </div>
            {ticket.project_id && projectAssets.length > 0 && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-400">Asset</dt>
                <dd className="mt-0.5">
                  <Select className="h-8 w-full text-xs" value={ticket.asset_id ?? ''}
                    onChange={(e) => updateTicket({ asset_id: e.target.value || null })}>
                    <option value="">— none —</option>
                    {projectAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </dd>
              </div>
            )}
            {ticket.resolved_at && (
              <div className="col-span-2"><dt className="text-xs text-slate-400">Resolved</dt><dd className="mt-0.5 text-slate-800">{fmtDate(ticket.resolved_at)}</dd></div>
            )}
          </dl>
        </div>

        {/* Comments */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Comments ({comments.length})
          </h2>
          <CommentThread
            comments={comments}
            onAdd={addComment}
            onDelete={deleteComment}
            currentUserId={user?.id}
          />
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  return <AuthGuard><OSShell><TicketDetail /></OSShell></AuthGuard>;
}
