'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building2, Phone, Globe, MapPin, FileText, Loader2, AlertCircle, Pencil, Check, X, FolderKanban, LifeBuoy, Receipt } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useCRMAccount } from '@/hooks/useCRMAccount';
import ContactSection from '@/components/crm/ContactSection';
import { STAGES } from '@/components/crm/PipelineBoard';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { Select, Button } from '@/components/ui/primitives';
import AppToast from '@/components/ui/AppToast';
import { currency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toneClasses } from '@/lib/statusColors';

const TYPE_LABELS = {
  hospitality: 'Hospitality', senior_living: 'Senior Living',
  multi_family: 'Multi-Family', education: 'Education',
  healthcare: 'Healthcare', other: 'Other',
};

const PSA_STATUS_TONE = {
  planning: 'neutral', active: 'info', on_hold: 'warning', complete: 'success', cancelled: 'danger',
};

const TICKET_STATUS_TONE = {
  open: 'info', in_progress: 'warning', waiting: 'progress', resolved: 'success', closed: 'neutral',
};

const INVOICE_STATUS_TONE = {
  draft: 'neutral', sent: 'info', paid: 'success', overdue: 'danger', void: 'neutral',
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Pill({ label, tone }) {
  return <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize', toneClasses(tone))}>{label?.replace(/_/g, ' ')}</span>;
}

function EmptyRow({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
      <Icon size={24} className="text-slate-200" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

const TABS = [
  { id: 'contacts', label: 'Contacts' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'projects', label: 'Projects' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'overview', label: 'Overview' },
];

function EditableField({ label, value, onSave, type = 'text', placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const commit = async () => {
    const v = draft.trim() || null;
    if (v !== (value ?? null)) await onSave(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
        <div className="flex items-center gap-1">
          <input autoFocus type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-blue-400 px-2 py-1 text-sm outline-none ring-2 ring-blue-500/20" />
          <button type="button" onClick={commit} aria-label="Save" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
          <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-slate-400">{label}</p>
      <button type="button" onClick={() => { setDraft(value ?? ''); setEditing(true); }} aria-label={`Edit ${label}`}
        className="group flex items-center gap-1 text-sm text-slate-700 hover:text-blue-600">
        {value || <span className="text-slate-300 italic">—</span>}
        <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

function EditableTextarea({ label, value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const commit = async () => {
    const v = draft.trim() || null;
    if (v !== (value ?? null)) await onSave(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-slate-400">{label}</p>
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-blue-400 px-2 py-1.5 text-sm outline-none ring-2 ring-blue-500/20 resize-none"
        />
        <div className="mt-1.5 flex gap-1">
          <button onClick={commit} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700">
            <Check size={12} /> Save
          </button>
          <button onClick={() => { setDraft(value ?? ''); setEditing(false); }} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-slate-400">{label}</p>
      <button
        onClick={() => { setDraft(value ?? ''); setEditing(true); }}
        className="group flex w-full items-start gap-1 text-left text-sm text-slate-700 hover:text-blue-600"
      >
        <span className="flex-1 whitespace-pre-wrap">
          {value || <span className="italic text-slate-300">—</span>}
        </span>
        <Pencil size={11} className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </div>
  );
}

function AccountDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const { account, contacts, quotes, projects, tickets, invoices, loading, updateAccount, createContact, deleteContact } = useCRMAccount(id, session);
  const [tab, setTab] = useState('contacts');
  const TAB_COUNTS = { contacts: contacts.length, quotes: quotes.length, projects: projects.length, tickets: tickets.length, invoices: invoices.length };
  const [toast, setToast] = useState(null);
  const save = async (patch) => { await updateAccount(patch); setToast({ type: 'success', message: 'Saved.' }); };

  if (loading) {
    return <div className="flex h-64 items-center justify-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={18} /> Loading…</div>;
  }
  if (!account) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
        <AlertCircle size={28} className="text-slate-300" />
        <p className="text-sm">Account not found.</p>
        <Link href="/crm" className="text-sm text-blue-600 hover:underline">← Back to CRM</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/crm" className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> CRM
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Building2 size={20} className="text-slate-500" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{account.name}</h1>
            <p className="text-xs text-slate-500">{TYPE_LABELS[account.type] ?? account.type}</p>
          </div>
          <Select className="h-8 w-32 text-xs" value={account.status}
            onChange={(e) => save({ status: e.target.value })}>
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}>
              {t.label}
              {TAB_COUNTS[t.id] > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500')}>
                  {TAB_COUNTS[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6">
        {tab === 'contacts' && (
          <ContactSection contacts={contacts} onAdd={createContact} onDelete={deleteContact} />
        )}

        {tab === 'quotes' && (
          <div className="max-w-2xl rounded-xl border border-slate-200 bg-white">
            {quotes.length === 0 ? (
              <EmptyRow icon={FolderKanban} message="No quotes for this account yet." />
            ) : quotes.map((q) => (
              <Link key={q.id} href={`/builder?project=${q.id}`}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{q.project_name}</p>
                  <p className="text-xs text-slate-400">Updated {fmtDate(q.updated_at)}</p>
                </div>
                <QuoteStatusBadge status={q.status} version={q.version} />
                <p className="w-24 shrink-0 text-right text-sm font-medium text-slate-700 tabular-nums">{currency(q.total_price)}</p>
              </Link>
            ))}
          </div>
        )}

        {tab === 'projects' && (
          <div className="max-w-2xl rounded-xl border border-slate-200 bg-white">
            {projects.length === 0 ? (
              <EmptyRow icon={FolderKanban} message="No projects for this account yet." />
            ) : projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.start_date ? fmtDate(p.start_date) : 'No start date'}{p.end_date ? ` – ${fmtDate(p.end_date)}` : ''}
                  </p>
                </div>
                <Pill label={p.status} tone={PSA_STATUS_TONE[p.status] ?? 'neutral'} />
                {p.budget != null && <p className="w-24 shrink-0 text-right text-sm font-medium text-slate-700 tabular-nums">{currency(p.budget)}</p>}
              </Link>
            ))}
          </div>
        )}

        {tab === 'tickets' && (
          <div className="max-w-2xl rounded-xl border border-slate-200 bg-white">
            {tickets.length === 0 ? (
              <EmptyRow icon={LifeBuoy} message="No support tickets for this account." />
            ) : tickets.map((t) => (
              <Link key={t.id} href={`/support/${t.id}`}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs capitalize text-slate-400">{t.priority} priority · {fmtDate(t.created_at)}</p>
                </div>
                <Pill label={t.status} tone={TICKET_STATUS_TONE[t.status] ?? 'info'} />
              </Link>
            ))}
          </div>
        )}

        {tab === 'invoices' && (
          <div className="max-w-2xl rounded-xl border border-slate-200 bg-white">
            {invoices.length === 0 ? (
              <EmptyRow icon={Receipt} message="No invoices for this account yet." />
            ) : invoices.map((inv) => (
              <Link key={inv.id} href="/invoices"
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{inv.title}</p>
                  <p className="text-xs text-slate-400">{inv.invoice_number} · {fmtDate(inv.invoice_date)}</p>
                </div>
                <Pill label={inv.status} tone={INVOICE_STATUS_TONE[inv.status] ?? 'neutral'} />
                <p className="w-24 shrink-0 text-right text-sm font-medium text-slate-700 tabular-nums">{currency(inv.total)}</p>
              </Link>
            ))}
          </div>
        )}

        {tab === 'overview' && (
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <EditableField label="Phone" value={account.phone} onSave={(v) => save({ phone: v })} type="tel" placeholder="(555) 000-0000" />
              <EditableField label="Website" value={account.website} onSave={(v) => save({ website: v })} placeholder="https://…" />
              <EditableField label="Address" value={account.address} onSave={(v) => save({ address: v })} placeholder="123 Main St…" />
              <EditableTextarea label="Notes" value={account.notes} onSave={(v) => save({ notes: v })} placeholder="Add notes about this account…" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pipeline</p>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-400">Stage</p>
                <Select className="h-8 w-44 text-xs" value={account.stage ?? 'new'} onChange={(e) => save({ stage: e.target.value })}>
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <EditableField label="Deal Value" value={account.deal_value} onSave={(v) => save({ deal_value: v ? Number(v) : null })} type="number" placeholder="$0" />
                <EditableField label="Probability (%)" value={account.probability} onSave={(v) => save({ probability: v ? Number(v) : null })} type="number" placeholder="0-100" />
              </div>
              <EditableField label="Expected Close Date" value={account.expected_close_date} onSave={(v) => save({ expected_close_date: v })} type="date" />
            </div>
          </div>
        )}
      </div>
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function CRMAccountPage() {
  return <AuthGuard><OSShell><AccountDetail /></OSShell></AuthGuard>;
}
