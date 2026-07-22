'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Building2, CheckCircle2, FileText, FolderKanban, Globe, LifeBuoy, Loader2,
  AlertCircle, MapPin, Phone, Plus, Receipt, RotateCcw, Send, User, Users, XCircle,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useCRMAccount } from '@/hooks/useCRMAccount';
import ContactSection from '@/components/crm/ContactSection';
import { STAGES } from '@/components/crm/PipelineBoard';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import { Button } from '@/components/ui/primitives';
import { EditableField, EditableTextarea } from '@/components/ui/EditableFields';
import AppToast from '@/components/ui/AppToast';
import { deriveNextSteps } from '@/lib/crmNextSteps';
import { currency, fmtDate } from '@/lib/format';
import { cn, initials } from '@/lib/utils';
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

const STEP_ICONS = {
  invoice: Receipt, proposal: Send, case: LifeBuoy, project: FolderKanban,
  contact: User, check: CheckCircle2,
};

// Brand-decorative fills come from Team Branding (Platform Settings) via the
// same CSS vars the app's buttons/sidebar use — never hardcoded hues. The
// remaining fixed gradients below are semantic category accents (projects/
// cases/billing), and status pills keep their semantic tones.
const BRAND_FILL = '[background:var(--ui-button-bg,linear-gradient(135deg,#2563eb,#0891b2))] text-[var(--brand-text,#fff)]';

const STEP_TONES = {
  danger: 'border-red-200 bg-red-50 [&_.step-ico]:bg-red-100 [&_.step-ico]:text-red-600',
  warning: 'border-amber-200 bg-amber-50 [&_.step-ico]:bg-amber-100 [&_.step-ico]:text-amber-600',
  info: 'border-blue-200 bg-blue-50 [&_.step-ico]:bg-blue-100 [&_.step-ico]:text-blue-600',
  success: 'border-emerald-200 bg-emerald-50 [&_.step-ico]:bg-emerald-100 [&_.step-ico]:text-emerald-600',
};

function Pill({ label, tone }) {
  return <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize', toneClasses(tone))}>{label?.replace(/_/g, ' ')}</span>;
}

function EmptyRow({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
      <Icon size={22} className="text-slate-200" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, iconClass, title, count, action = null, children, id }) {
  return (
    <div id={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', iconClass)}>
          <Icon size={14} />
        </span>
        <h3 className="flex-1 text-[13px] font-bold text-slate-800">{title}</h3>
        {count != null && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{count}</span>
        )}
        {action}
      </div>
      {children}
    </div>
  );
}

function StatTile({ iconClass, icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold tabular-nums leading-tight text-slate-900">{value}</p>
        <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// Clickable pipeline progress: New → Qualifying → Proposal → Negotiation → Won.
// "Lost" isn't a step on the journey — it's the small escape hatch beside it.
function PipelineStepper({ stage, onSetStage }) {
  const steps = STAGES.filter((s) => s.id !== 'lost');
  const currentIdx = steps.findIndex((s) => s.id === stage);
  const isLost = stage === 'lost';

  if (isLost) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <XCircle size={15} /> This deal is marked Lost.
        </p>
        <Button variant="outline" size="sm" onClick={() => onSetStage('qualifying')}>
          <RotateCcw size={13} /> Reopen
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5">
        {steps.map((s, i) => {
          const done = currentIdx >= 0 && i < currentIdx;
          const current = i === currentIdx;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSetStage(s.id)}
              title={`Move to ${s.label}`}
              className="group min-w-0 flex-1"
            >
              <span
                className={cn(
                  'block h-2 rounded-full border transition-all',
                  done || current
                    ? 'border-transparent [background:var(--ui-button-bg,var(--brand,#2563eb))]'
                    : 'border-slate-200 bg-slate-100 group-hover:bg-slate-200',
                  current && '[box-shadow:0_0_0_3px_color-mix(in_srgb,var(--brand,#2563eb)_28%,transparent)]'
                )}
              />
              <span
                className={cn(
                  'mt-1.5 block truncate text-center text-[11px] transition-colors',
                  current ? 'font-bold text-slate-900' : done ? 'font-semibold text-slate-500' : 'font-medium text-slate-400 group-hover:text-slate-500'
                )}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onSetStage('lost')}
        className="mt-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:text-red-500"
      >
        Mark lost
      </button>
    </div>
  );
}

function NextSteps({ steps }) {
  return (
    <section className="mt-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.25)]" />
        <h2 className="text-sm font-bold text-slate-800">What to do next</h2>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s) => {
          const Icon = STEP_ICONS[s.icon] ?? CheckCircle2;
          return (
            <div key={s.id} className={cn('flex items-center gap-3 rounded-2xl border p-3.5 shadow-sm', STEP_TONES[s.tone])}>
              <span className="step-ico flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-slate-800">{s.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-500">{s.detail}</p>
              </div>
              {s.href && (
                s.href.startsWith('#') ? (
                  <a href={s.href} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    {s.cta} →
                  </a>
                ) : (
                  <Link href={s.href} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    {s.cta} →
                  </Link>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// One property card: its proposals, its project (once one exists), and the
// per-property "New Proposal" push into the Builder.
function PropertyCard({ property, accountId, quotes, project, contacts = [] }) {
  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-slate-200 last:mb-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-slate-800">{property.name}</p>
          <p className="truncate text-[11px] text-slate-400">
            {property.address || 'No address'}
            {contacts.length > 0 && <> · <Users size={10} className="inline" /> {contacts.map((c) => `${c.first_name}${c.last_name ? ` ${c.last_name}` : ''}`).join(' · ')}</>}
          </p>
        </div>
        {project ? (
          <Link href={`/projects/${project.id}`}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
            <FolderKanban size={12} /> View Project
          </Link>
        ) : (
          <Link href={`/builder?account=${accountId}&property=${property.id}`}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50">
            <Plus size={12} /> New Proposal
          </Link>
        )}
      </div>
      {quotes.length === 0 ? (
        <p className="px-3.5 py-2.5 text-xs text-slate-400">No proposals for this property yet.</p>
      ) : quotes.map((q) => (
        <Link key={q.id} href={`/builder?project=${q.id}`}
          className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0 hover:bg-slate-50">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-700">{q.project_name}</p>
            <p className="text-[11px] text-slate-400">Updated {fmtDate(q.updated_at)}</p>
          </div>
          <QuoteStatusBadge status={q.status} version={q.version} />
          <p className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-700">{currency(q.total_price)}</p>
        </Link>
      ))}
    </div>
  );
}

function AddPropertyForm({ onCreate }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({ name, address: address.trim() || null });
      setName('');
      setAddress('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name…"
        className="h-8 min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)"
        className="h-8 min-w-[140px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
      <Button type="submit" size="sm" disabled={!name.trim() || busy}>
        <Plus size={13} /> {busy ? 'Adding…' : 'Add'}
      </Button>
    </form>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function AccountDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const { account, contacts, quotes, properties, projects, tickets, invoices, loading, updateAccount, createContact, updateContact, deleteContact, createProperty, setContactProperties } = useCRMAccount(id, session);
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

  const nextSteps = deriveNextSteps({ account, contacts, quotes, projects, tickets, invoices });

  // At-a-glance tiles.
  const openPipeline = quotes
    .filter((q) => q.status === 'draft' || q.status === 'sent')
    .reduce((s, q) => s + (Number(q.total_price) || 0), 0);
  const pipelineValue = openPipeline > 0 ? openPipeline : Number(account.deal_value) || 0;
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning').length;
  const openCases = tickets.filter((t) => !['resolved', 'closed'].includes(t.status)).length;
  const unpaid = invoices
    .filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  return (
    <div className="min-h-full bg-slate-50/60 p-5">
      <div className="mx-auto max-w-6xl">
        <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
          <ArrowLeft size={13} /> CRM
        </Link>

        {/* ── Hero ── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Thin brand accent strip — never overlaps the avatar or name. */}
          <div className="relative h-2.5 [background:var(--ui-button-bg,linear-gradient(100deg,#2563eb,#0891b2))]" />
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold shadow-md', BRAND_FILL)}>
              {initials(account.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{account.name}</h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700">
                  {TYPE_LABELS[account.type] ?? account.type}
                </span>
                {account.phone && (
                  <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                    <Phone size={10} /> {account.phone}
                  </span>
                )}
                {account.website && (
                  <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                    <Globe size={10} /> {account.website.replace(/^https?:\/\//, '')}
                  </span>
                )}
                {account.address && (
                  <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                    <MapPin size={10} /> {account.address}
                  </span>
                )}
              </div>
            </div>
            <Link href={`/builder?account=${id}`}>
              <Button size="sm"><FileText size={13} /> New Proposal</Button>
            </Link>
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Pipeline</span>
              <span className="text-xs text-slate-500">
                {pipelineValue > 0 && <>Value <b className="text-slate-800">{currency(pipelineValue)}</b></>}
                {account.probability != null && <> · <b className="text-slate-800">{account.probability}%</b> probability</>}
                {account.expected_close_date && <> · closes <b className="text-slate-800">{fmtDate(account.expected_close_date)}</b></>}
              </span>
            </div>
            <PipelineStepper stage={account.stage ?? 'new'} onSetStage={(stage) => save({ stage })} />
          </div>
        </section>

        {/* ── Next steps ── */}
        <NextSteps steps={nextSteps} />

        {/* ── Stat tiles ── */}
        <section className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatTile icon={FileText} iconClass={BRAND_FILL} value={currency(pipelineValue)} label="Open pipeline" />
          <StatTile icon={FolderKanban} iconClass="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white" value={activeProjects} label="Active projects" />
          <StatTile icon={LifeBuoy} iconClass="bg-gradient-to-br from-amber-500 to-red-500 text-white" value={openCases} label="Open cases" />
          <StatTile icon={Receipt} iconClass="bg-gradient-to-br from-emerald-600 to-teal-600 text-white" value={currency(unpaid)} label="Unpaid invoices" />
        </section>

        {/* ── Everything, two columns ── */}
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
          {/* Left: the money trail */}
          <div className="min-w-0 space-y-4">
            <SectionCard
              icon={Building2}
              iconClass={BRAND_FILL}
              title="Properties & Proposals"
              count={`${properties.length} · ${quotes.length}`}
            >
              <div className="pt-3">
                <AddPropertyForm onCreate={createProperty} />
                {properties.length === 0 && quotes.length === 0 && (
                  <EmptyRow icon={Building2} message="No properties yet — each property groups its proposals and becomes a project." />
                )}
                {properties.map((prop) => (
                  <PropertyCard
                    key={prop.id}
                    property={prop}
                    accountId={id}
                    quotes={quotes.filter((q) => q.property_id === prop.id)}
                    project={projects.find((p) => p.property_id === prop.id) ?? null}
                    contacts={contacts.filter((c) => (c.crm_contact_properties ?? []).some((l) => l.property_id === prop.id))}
                  />
                ))}
                {quotes.some((q) => !q.property_id) && (
                  <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-slate-200">
                    <p className="border-b border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Not linked to a property</p>
                    {quotes.filter((q) => !q.property_id).map((q) => (
                      <Link key={q.id} href={`/builder?project=${q.id}`}
                        className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-slate-700">{q.project_name}</p>
                          <p className="text-[11px] text-slate-400">Open in the Builder and pick a property to link it</p>
                        </div>
                        <QuoteStatusBadge status={q.status} version={q.version} />
                        <p className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-700">{currency(q.total_price)}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard icon={FolderKanban} iconClass="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white" title="Projects" count={projects.length}>
              {projects.length === 0 ? (
                <EmptyRow icon={FolderKanban} message="No projects for this account yet." />
              ) : projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{p.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {p.start_date ? fmtDate(p.start_date) : 'No start date'}{p.end_date ? ` – ${fmtDate(p.end_date)}` : ''}
                    </p>
                  </div>
                  <Pill label={p.status} tone={PSA_STATUS_TONE[p.status] ?? 'neutral'} />
                  {p.budget != null && <p className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-700">{currency(p.budget)}</p>}
                </Link>
              ))}
            </SectionCard>

            <SectionCard
              icon={Receipt}
              iconClass="bg-gradient-to-br from-emerald-600 to-teal-600 text-white"
              title="Billing"
              count={unpaid > 0 ? `${currency(unpaid)} open` : invoices.length}
            >
              {invoices.length === 0 ? (
                <EmptyRow icon={Receipt} message="No invoices for this account yet." />
              ) : invoices.map((inv) => (
                <Link key={inv.id} href="/invoices"
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{inv.title}</p>
                    <p className="text-[11px] text-slate-400">{inv.invoice_number} · {fmtDate(inv.invoice_date)}</p>
                  </div>
                  <Pill label={inv.status} tone={INVOICE_STATUS_TONE[inv.status] ?? 'neutral'} />
                  <p className="w-24 shrink-0 text-right text-[13px] font-bold tabular-nums text-slate-700">{currency(inv.total)}</p>
                </Link>
              ))}
            </SectionCard>
          </div>

          {/* Right: people, support, facts */}
          <div className="min-w-0 space-y-4">
            <SectionCard id="contacts" icon={Users} iconClass={BRAND_FILL} title="Contacts" count={contacts.length}>
              <div className="p-4">
                <ContactSection contacts={contacts} properties={properties}
                  onAdd={createContact} onUpdate={updateContact} onDelete={deleteContact}
                  onSetProperties={setContactProperties} />
              </div>
            </SectionCard>

            <SectionCard icon={LifeBuoy} iconClass="bg-gradient-to-br from-amber-500 to-red-500 text-white" title="Support Cases" count={openCases > 0 ? `${openCases} open` : tickets.length}>
              {tickets.length === 0 ? (
                <EmptyRow icon={LifeBuoy} message="No support cases for this account." />
              ) : tickets.map((t) => (
                <Link key={t.id} href={`/support/${t.id}`}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full',
                    t.priority === 'urgent' || t.priority === 'high' ? 'bg-red-500'
                      : t.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{t.title}</p>
                    <p className="text-[11px] capitalize text-slate-400">{t.priority} priority · {fmtDate(t.created_at)}</p>
                  </div>
                  <Pill label={t.status} tone={TICKET_STATUS_TONE[t.status] ?? 'info'} />
                </Link>
              ))}
            </SectionCard>

            <SectionCard icon={User} iconClass="bg-gradient-to-br from-emerald-600 to-teal-600 text-white" title="Account Details">
              <div className="space-y-4 p-4">
                <EditableField label="Phone" value={account.phone} onSave={(v) => save({ phone: v })} type="tel" placeholder="(555) 000-0000" />
                <EditableField label="Website" value={account.website} onSave={(v) => save({ website: v })} placeholder="https://…" />
                <EditableField label="Address" value={account.address} onSave={(v) => save({ address: v })} placeholder="123 Main St…" />
                <div className="grid grid-cols-2 gap-4">
                  <EditableField label="Deal Value" value={account.deal_value} onSave={(v) => save({ deal_value: v ? Number(v) : null })} type="number" placeholder="$0" />
                  <EditableField label="Probability (%)" value={account.probability} onSave={(v) => save({ probability: v ? Number(v) : null })} type="number" placeholder="0-100" />
                </div>
                <EditableField label="Expected Close Date" value={account.expected_close_date} onSave={(v) => save({ expected_close_date: v })} type="date" />
                <EditableTextarea label="Notes" value={account.notes} onSave={(v) => save({ notes: v })} placeholder="Add notes about this account…" />
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function CRMAccountPage() {
  return <AuthGuard><OSShell><AccountDetail /></OSShell></AuthGuard>;
}
