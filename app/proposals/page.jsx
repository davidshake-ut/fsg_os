'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileCheck, Search, FolderKanban, ExternalLink, CheckCircle2 } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useProjects } from '@/hooks/useProjects';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { useProperties } from '@/hooks/useProperties';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import QuoteLifecycleMenu from '@/components/QuoteLifecycleMenu';
import { Card, Button, Select, TextInput, EmptyState } from '@/components/ui/primitives';
import ErrorBanner from '@/components/ui/ErrorBanner';
import AppToast from '@/components/ui/AppToast';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = ['all', 'draft', 'sent', 'accepted', 'declined', 'expired'];

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProposalsContent() {
  const { session, company, user } = useSession();
  const { projects: proposals, loading, loadError, refresh, setQuoteStatus } = useProjects(session, company, user);
  const { accounts } = useCRMAccounts(session, company, user);
  const { properties } = useProperties(session, company);
  const { projects: psaProjects } = usePSAProjects(session, company, user);

  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const propertyName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
  // A proposal's project: by direct quote link, or by its property (one
  // project per property, migration 0040).
  const projectByQuote = useMemo(() => new Map(psaProjects.filter((p) => p.quote_id).map((p) => [p.quote_id, p])), [psaProjects]);
  const projectByProperty = useMemo(() => new Map(psaProjects.filter((p) => p.property_id).map((p) => [p.property_id, p])), [psaProjects]);

  const filtered = proposals.filter((p) => {
    if (statusFilter !== 'all' && (p.status ?? 'draft') !== statusFilter) return false;
    if (accountFilter && p.crm_account_id !== accountFilter) return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = `${p.project_name ?? ''} ${accountName.get(p.crm_account_id) ?? ''} ${propertyName.get(p.property_id) ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = proposals.reduce((acc, p) => {
    const s = p.status ?? 'draft';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const handleTransition = async (proposal, status) => {
    try {
      // No catalog snapshot from here — marking Sent with frozen pricing
      // happens in the Builder, where the live BOM exists. Status-only
      // transitions (accept/decline/reopen) are safe from the list.
      await setQuoteStatus(proposal.id, status);
      setToast({ type: 'success', message: `"${proposal.project_name}" marked ${status}.` });
    } catch (e) {
      setToast({ type: 'error', message: e.message });
    }
  };

  return (
    <div className="space-y-5 p-6">
      <ErrorBanner error={loadError} onRetry={refresh} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <FileCheck size={20} className="text-slate-400" /> Proposals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every proposal across accounts and properties. Author in the System Builder; accepted proposals become projects.
          </p>
        </div>
        <Link href="/builder">
          <Button size="sm"><FileCheck size={14} /> New Proposal</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
          {STATUS_FILTERS.map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all',
                statusFilter === s
                  ? '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700')}>
              {s === 'all' ? 'All' : s}
              <span className="ml-1 text-xs opacity-70">{s === 'all' ? proposals.length : counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <Select className="h-9 w-48 text-sm" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <TextInput className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search proposals…" />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 && !loading ? (
        <EmptyState
          icon={FileCheck}
          title={proposals.length === 0 ? 'No proposals yet' : 'No proposals match your filters'}
          description={proposals.length === 0 ? 'Author your first proposal in the System Builder.' : undefined}
          action={proposals.length === 0 ? <Link href="/builder"><Button size="sm">Open System Builder</Button></Link> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const project = projectByQuote.get(p.id) ?? (p.property_id ? projectByProperty.get(p.property_id) : null);
            const isAccepted = (p.status ?? 'draft') === 'accepted';
            return (
              <Card key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex items-center gap-2">
                    <Link href={`/builder?project=${p.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-[var(--brand,#2563eb)] hover:underline">
                      {p.project_name || 'Untitled proposal'}
                    </Link>
                    <QuoteLifecycleMenu quote={p} onTransition={(status) => handleTransition(p, status)} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {accountName.get(p.crm_account_id) ?? 'No account'}
                    {p.property_id ? ` · ${propertyName.get(p.property_id) ?? 'Property'}` : ''}
                    {` · Updated ${fmtDate(p.updated_at)}`}
                  </p>
                </div>

                <p className="w-24 shrink-0 text-right font-mono text-sm font-semibold text-slate-800">{fmtMoney(p.total_price)}</p>

                <div className="flex shrink-0 items-center gap-2">
                  {project ? (
                    <Link href={`/projects/${project.id}`}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
                      <CheckCircle2 size={13} /> View Project
                    </Link>
                  ) : isAccepted ? (
                    <Link href={`/builder?project=${p.id}&createProject=1`}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium shadow-sm [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] hover:brightness-110 transition-all">
                      <FolderKanban size={13} /> Create Project
                    </Link>
                  ) : (
                    <Link href={`/builder?project=${p.id}`}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50">
                      <ExternalLink size={13} /> Open in Builder
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <AuthGuard>
      <OSShell>
        <ProposalsContent />
      </OSShell>
    </AuthGuard>
  );
}
