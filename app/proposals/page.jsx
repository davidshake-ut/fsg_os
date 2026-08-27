'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileCheck, Search, FolderKanban, ExternalLink, CheckCircle2, ChevronRight, FileDown, History, Layers } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useBranding } from '@/hooks/useBranding';
import OptionsComparison from '@/components/OptionsComparison';
import { buildOptionComparison, optionHeads, DEFAULT_TERM_MONTHS } from '@/lib/optionComparison';
import { exportOptionsPDF } from '@/lib/exportOptionsPDF';
import { useProjects } from '@/hooks/useProjects';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { useProperties } from '@/hooks/useProperties';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import QuoteLifecycleMenu from '@/components/QuoteLifecycleMenu';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { Card, Button, Select, TextInput, EmptyState } from '@/components/ui/primitives';
import ErrorBanner from '@/components/ui/ErrorBanner';
import AppToast from '@/components/ui/AppToast';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/format';

const STATUS_FILTERS = ['all', 'draft', 'sent', 'accepted', 'declined', 'expired'];

function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Signed-URL download for the attached proposal PDF (private bucket).
function PdfChip({ path, className }) {
  const supabase = getSupabase();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { data } = await supabase.storage.from('proposal-files').createSignedUrl(path, 300);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={open} disabled={busy} title="Open the proposal PDF"
      className={cn('flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-600', className)}>
      <FileDown size={12} /> {busy ? '…' : 'PDF'}
    </button>
  );
}

function ProposalsContent() {
  const { session, company, user, canWrite, isAdmin } = useSession();
  const { projects: proposals, loading, loadError, refresh, setQuoteStatus, setOptionMeta } = useProjects(session, company, user);
  const { branding } = useBranding({ configured: isSupabaseConfigured, company });
  // Cost and margin are admin-only in team mode, like the Builder.
  const canViewMargin = !isSupabaseConfigured || !!isAdmin;
  const { accounts } = useCRMAccounts(session, company, user);
  const { properties } = useProperties(session, company);
  const { projects: psaProjects } = usePSAProjects(session, company, user);

  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  // Design options (0068): which group's comparison is open, the per-unit
  // term, and the recommendation printed on the customer options PDF.
  const [compareGroup, setCompareGroup] = useState(null);
  const [termMonths, setTermMonths] = useState(DEFAULT_TERM_MONTHS);
  const [recommendation, setRecommendation] = useState('');

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const propertyName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
  // A proposal's project: by direct quote link, or by its property (one
  // project per property, migration 0040).
  const projectByQuote = useMemo(() => new Map(psaProjects.filter((p) => p.quote_id).map((p) => [p.quote_id, p])), [psaProjects]);
  const projectByProperty = useMemo(() => new Map(psaProjects.filter((p) => p.property_id).map((p) => [p.property_id, p])), [psaProjects]);

  // One row per proposal lineage: the latest version leads, older versions
  // sit in an expandable archive underneath. Groups are ordered by the
  // head's creation date — deliberately NOT updated_at, so a status change
  // never reshuffles rows under the user's cursor (the source of the
  // wrong-row mis-click).
  const groups = useMemo(() => {
    const byRoot = new Map();
    for (const p of proposals) {
      const key = p.parent_quote_id ?? p.id;
      if (!byRoot.has(key)) byRoot.set(key, []);
      byRoot.get(key).push(p);
    }
    return [...byRoot.values()]
      .map((list) => {
        const sorted = [...list].sort((a, b) =>
          ((b.version ?? 1) - (a.version ?? 1)) || (a.created_at < b.created_at ? 1 : -1));
        return { head: sorted[0], archived: sorted.slice(1) };
      })
      .sort((a, b) => ((a.head.created_at ?? '') < (b.head.created_at ?? '') ? 1 : -1));
  }, [proposals]);

  // Design options: sibling quotes sharing an option_group_id, one latest
  // version each, compared side by side above the list.
  const optionGroups = useMemo(() => {
    const ids = [...new Set(proposals.map((p) => p.option_group_id).filter(Boolean))];
    return ids
      .map((gid) => ({ id: gid, options: optionHeads(proposals, gid) }))
      .filter((g) => g.options.length > 0)
      .sort((a, b) => ((a.options[0].created_at ?? '') < (b.options[0].created_at ?? '') ? 1 : -1));
  }, [proposals]);

  const filteredGroups = groups.filter(({ head, archived }) => {
    if (statusFilter !== 'all' && (head.status ?? 'draft') !== statusFilter) return false;
    if (accountFilter && head.crm_account_id !== accountFilter) return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = [
        head.project_name,
        accountName.get(head.crm_account_id),
        propertyName.get(head.property_id),
        ...archived.map((a) => a.project_name),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = groups.reduce((acc, { head }) => {
    const s = head.status ?? 'draft';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
              <span className="ml-1 text-xs opacity-70">{s === 'all' ? groups.length : counts[s] ?? 0}</span>
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

      {/* Design options — a property quoted several ways */}
      {optionGroups.length > 0 && (
        <div className="space-y-2">
          {optionGroups.map((g) => {
            const head = g.options[0];
            const title = propertyName.get(head.property_id) ?? head.project_name ?? 'Property';
            const comparison = buildOptionComparison(g.options.map((q) => ({ id: q.id, quote: q })), { termMonths });
            const open = compareGroup === g.id;
            return (
              <Card key={g.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <Layers size={14} className="text-slate-400" /> {title}
                      <span className="text-xs font-normal text-slate-400">· {g.options.length} design option{g.options.length === 1 ? '' : 's'}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                      {g.options.map((q) => (
                        <Link key={q.id} href={`/builder?project=${q.id}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 hover:border-slate-300 hover:bg-white">
                          {q.option_label || q.project_name} · {fmtMoney(q.total_price)}
                        </Link>
                      ))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCompareGroup(open ? null : g.id)}>
                      {open ? 'Hide comparison' : 'Compare'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportOptionsPDF({
                          comparison,
                          propertyName: title,
                          accountName: accountName.get(head.crm_account_id) ?? '',
                          recommendation,
                          branding,
                        })
                      }
                    >
                      <FileDown size={13} /> Customer PDF
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="mt-3">
                    <OptionsComparison
                      comparison={comparison}
                      canViewMargin={canViewMargin}
                      canWrite={canWrite}
                      termMonths={termMonths}
                      onTermChange={setTermMonths}
                      recommendation={recommendation}
                      onRecommendationChange={setRecommendation}
                      onUpdateOption={async (id, patch) => {
                        try {
                          await setOptionMeta(id, patch);
                        } catch (e) {
                          setToast({ type: 'error', message: e.message });
                        }
                      }}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* List */}
      {filteredGroups.length === 0 && !loading ? (
        <EmptyState
          icon={FileCheck}
          title={proposals.length === 0 ? 'No proposals yet' : 'No proposals match your filters'}
          description={proposals.length === 0 ? 'Author your first proposal in the System Builder — the Create Proposal button files it here.' : undefined}
          action={proposals.length === 0 ? <Link href="/builder"><Button size="sm">Open System Builder</Button></Link> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(({ head: p, archived }) => {
            const project = projectByQuote.get(p.id) ?? (p.property_id ? projectByProperty.get(p.property_id) : null);
            const isAccepted = (p.status ?? 'draft') === 'accepted';
            const isOpen = expanded.has(p.id);
            return (
              <Card key={p.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex items-center gap-2">
                      <Link href={`/builder?project=${p.id}`} className="truncate text-sm font-semibold text-slate-900 hover:text-[var(--brand,#2563eb)] hover:underline">
                        {p.project_name || 'Untitled proposal'}
                      </Link>
                      <QuoteLifecycleMenu quote={p} onTransition={(status) => handleTransition(p, status)} />
                      {p.option_label && (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="Design option">
                          {p.option_label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-slate-400">
                      {accountName.get(p.crm_account_id) ?? 'No account'}
                      {p.property_id ? ` · ${propertyName.get(p.property_id) ?? 'Property'}` : ''}
                      {` · Updated ${fmtDate(p.updated_at)}`}
                      {archived.length > 0 && (
                        <button type="button" onClick={() => toggleExpanded(p.id)}
                          className="flex items-center gap-0.5 font-medium text-slate-500 hover:text-blue-600">
                          <ChevronRight size={11} className={cn('transition-transform', isOpen && 'rotate-90')} />
                          <History size={11} /> {archived.length} older version{archived.length !== 1 ? 's' : ''}
                        </button>
                      )}
                    </p>
                  </div>

                  <p className="w-24 shrink-0 text-right font-mono text-sm font-semibold text-slate-800">{fmtMoney(p.total_price)}</p>

                  <div className="flex shrink-0 items-center gap-2">
                    {p.pdf_path && <PdfChip path={p.pdf_path} />}
                    {!project && (
                      <Link href={`/builder?project=${p.id}`}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50">
                        <ExternalLink size={13} /> Open in Builder
                      </Link>
                    )}
                    {project ? (
                      <Link href={`/projects/${project.id}`}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
                        <CheckCircle2 size={13} /> View Project
                      </Link>
                    ) : canWrite && (
                      /* Any proposal can become the project; accepted ones get
                         the loud treatment since that's the natural next step. */
                      <Link href={`/builder?project=${p.id}&createProject=1`}
                        className={cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all',
                          isAccepted
                            ? 'shadow-sm [background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] hover:brightness-110'
                            : 'border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100')}>
                        <FolderKanban size={13} /> Create Project
                      </Link>
                    )}
                  </div>
                </div>

                {/* Version archive — the paths not taken, kept on the record */}
                {isOpen && archived.length > 0 && (
                  <div className="mt-3 space-y-1 border-l-2 border-slate-100 pl-4">
                    {archived.map((v) => (
                      <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <QuoteStatusBadge status={v.status} version={v.version} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                          {v.project_name || 'Untitled'} · {fmtDate(v.updated_at)}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-slate-500">{fmtMoney(v.total_price)}</span>
                        {v.pdf_path && <PdfChip path={v.pdf_path} className="h-6" />}
                        <Link href={`/builder?project=${v.id}`}
                          className="flex h-6 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-white">
                          <ExternalLink size={11} /> Open
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
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
