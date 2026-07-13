'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Building2, Calendar, ExternalLink, MessageSquare, History, UserRound } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useSupportTicket } from '@/hooks/useSupportTicket';
import { useConversations } from '@/hooks/useConversations';
import TicketPriorityBadge, { TicketStatusBadge, TicketCategoryBadge, STATUS_CONFIG, PRIORITY_CONFIG, CATEGORY_CONFIG } from '@/components/support/TicketPriorityBadge';
import CommentThread from '@/components/support/CommentThread';
import InstalledEquipment from '@/components/projects/InstalledEquipment';
import { Select, Button } from '@/components/ui/primitives';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ASSET_TYPE_LABELS = {
  access_point: 'Access Point', camera: 'Camera', switch: 'Switch',
  gateway: 'Gateway', nvr: 'NVR', other: 'Other',
};

function TicketDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { session, company, user } = useSession();
  const {
    ticket, comments, projects, members, projectAssets, priorTickets, bomSnapshot,
    loading, updateTicket, addComment, deleteComment,
  } = useSupportTicket(id, session, company);
  const { openProjectChannel } = useConversations(session, company, user);
  const [openingChannel, setOpeningChannel] = useState(false);

  const messageTeam = async () => {
    if (!ticket?.project_id || openingChannel) return;
    setOpeningChannel(true);
    try {
      const convo = await openProjectChannel({ id: ticket.project_id, name: ticket.psa_projects?.name ?? 'Project' });
      if (convo?.id) router.push(`/messages?c=${convo.id}`);
    } finally {
      setOpeningChannel(false);
    }
  };

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

  const selectedAsset = projectAssets.find((a) => a.id === ticket.asset_id) ?? null;

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
                <Link href={`/crm/${ticket.account_id}`} className="flex items-center gap-1 hover:text-blue-600 hover:underline">
                  <Building2 size={12} /> {ticket.crm_accounts.name}
                </Link>
              )}
              {ticket.psa_projects?.name && (
                <Link href={`/projects/${ticket.project_id}`} className="flex items-center gap-1 hover:text-blue-600 hover:underline">
                  <ExternalLink size={12} /> {ticket.psa_projects.name}
                </Link>
              )}
              <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(ticket.created_at)}</span>
              {ticket.opened_by && (
                <span className="flex items-center gap-1">
                  <UserRound size={12} /> Opened by {ticket.opened_by.full_name || ticket.opened_by.email}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ticket.project_id && (
              <Button size="sm" variant="outline" onClick={messageTeam} disabled={openingChannel}>
                {openingChannel ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                Message Team
              </Button>
            )}
            <TicketCategoryBadge category={ticket.category} />
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

      <div className="flex-1 p-6">
        <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
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
                <div>
                  <dt className="text-xs text-slate-400">Priority</dt>
                  <dd className="mt-0.5">
                    <Select className="h-8 w-full text-xs" value={ticket.priority}
                      onChange={(e) => updateTicket({ priority: e.target.value })}>
                      {Object.entries(PRIORITY_CONFIG).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </Select>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Category</dt>
                  <dd className="mt-0.5">
                    <Select className="h-8 w-full text-xs" value={ticket.category ?? 'other'}
                      onChange={(e) => updateTicket({ category: e.target.value })}>
                      {Object.entries(CATEGORY_CONFIG).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </Select>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Assigned to</dt>
                  <dd className="mt-0.5">
                    <Select className="h-8 w-full text-xs" value={ticket.assigned_to ?? ''}
                      onChange={(e) => updateTicket({ assigned_to: e.target.value || null })}>
                      <option value="">— unassigned —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                      ))}
                    </Select>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Due by</dt>
                  <dd className="mt-0.5">
                    <input type="date" value={ticket.due_date ?? ''}
                      onChange={(e) => updateTicket({ due_date: e.target.value || null })}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    {ticket.due_date && ticket.due_date < new Date().toISOString().slice(0, 10) && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                      <p className="mt-1 text-xs font-semibold text-rose-500">Overdue</p>
                    )}
                  </dd>
                </div>
                <div><dt className="text-xs text-slate-400">Status</dt><dd className="mt-0.5"><TicketStatusBadge status={ticket.status} /></dd></div>
                <div><dt className="text-xs text-slate-400">Opened on</dt><dd className="mt-0.5 text-slate-800">{fmtDate(ticket.created_at)}</dd></div>
                {ticket.crm_accounts?.name && (
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400">Account</dt>
                    <dd className="mt-0.5">
                      <Link href={`/crm/${ticket.account_id}`} className="font-medium text-blue-600 hover:underline">
                        {ticket.crm_accounts.name}
                      </Link>
                    </dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="flex items-center justify-between text-xs text-slate-400">
                    Project
                    {ticket.project_id && (
                      <Link href={`/projects/${ticket.project_id}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                        view <ExternalLink size={10} />
                      </Link>
                    )}
                  </dt>
                  <dd className="mt-0.5">
                    <Select className="h-8 w-full text-xs" value={ticket.project_id ?? ''}
                      onChange={(e) => updateTicket({ project_id: e.target.value || null, asset_id: null })}>
                      <option value="">— none —</option>
                      {projects
                        .filter((p) => !ticket.account_id || !p.crm_account_id || p.crm_account_id === ticket.account_id)
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                      {selectedAsset && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          {ASSET_TYPE_LABELS[selectedAsset.asset_type] ?? selectedAsset.asset_type}
                          {selectedAsset.serial_number ? ` · S/N ${selectedAsset.serial_number}` : ''}
                          {selectedAsset.location ? ` · ${selectedAsset.location}` : ''}
                          {selectedAsset.install_date ? ` · installed ${fmtDay(selectedAsset.install_date)}` : ''}
                        </p>
                      )}
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

          {/* Context rail — the bundle: history + what was installed */}
          <div className="space-y-6">
            {priorTickets.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <History size={12} /> Previous tickets for this account
                </h2>
                <div className="space-y-1">
                  {priorTickets.map((t) => (
                    <Link key={t.id} href={`/support/${t.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-700">{t.title}</span>
                        <span className="text-[11px] text-slate-400">{fmtDay(t.created_at)}</span>
                      </span>
                      <TicketStatusBadge status={t.status} className="shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <InstalledEquipment bomSnapshot={bomSnapshot} title="Installed at this project" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  return <AuthGuard><OSShell><TicketDetail /></OSShell></AuthGuard>;
}
