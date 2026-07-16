import Link from 'next/link';
import PartnerContactButton from '@/components/PartnerContactDialog';
import {
  Layers,
  LayoutDashboard,
  Users,
  Wrench,
  FolderKanban,
  LifeBuoy,
  Receipt,
  BookOpen,
  MessageSquare,
  Puzzle,
  Palette,
  ShieldCheck,
  GitCompareArrows,
  Calculator,
  Workflow,
  ArrowRight,
  LogIn,
  CheckCircle2,
} from 'lucide-react';

// Public marketing landing for os.fusionsg.com. Fully static — the "Log In"
// CTA points at /dashboard, which shows the sign-in screen to visitors and
// drops signed-in partners straight into the app.

export const metadata = {
  title: 'FSG OS — The Business OS for Technology Integrators',
  description:
    'Quote multi-vendor systems, win the proposal, deliver the project, support the property, and bill it — one white-label platform for technology integrators.',
};

const CONTACT_MAILTO =
  'mailto:david.shake@fusionsg.com?subject=FSG%20OS%20%E2%80%94%20New%20Partner%20Inquiry';

const MODULES = [
  { icon: LayoutDashboard, name: 'Dashboard', blurb: 'Live KPIs, active projects, and open tickets — customizable per team.' },
  { icon: Users, name: 'CRM', blurb: 'Accounts, contacts, properties, and a pipeline that flows into quotes.' },
  { icon: Wrench, name: 'System Builder', blurb: 'CPQ with design calculators — rooms and ratios in, full BOM and labor out.' },
  { icon: FolderKanban, name: 'Projects', blurb: 'PSA with task plans, Gantt + dependencies, kanban, and time tracking.' },
  { icon: LifeBuoy, name: 'Support', blurb: 'Ticketing with assignments, priorities, due dates, and installed equipment.' },
  { icon: Receipt, name: 'Invoices', blurb: 'Bill projects and change orders; unbilled work surfaces itself.' },
  { icon: BookOpen, name: 'Resources', blurb: 'A searchable knowledge base and document library for the whole team.' },
  { icon: MessageSquare, name: 'Messages', blurb: 'DMs, group channels, and per-project channels with mentions.' },
];

const FLOW = [
  { step: 'Sell', text: 'Track the account in CRM and design the system in the Builder — every technology, side by side.' },
  { step: 'Propose', text: 'One click turns the design into a customer-ready proposal PDF with scope of work, filed and versioned.' },
  { step: 'Deliver', text: 'An accepted proposal becomes a project with a generated task plan, schedule, and budget split.' },
  { step: 'Support & Bill', text: 'Installed equipment feeds support tickets; completed work feeds invoices. Nothing falls through.' },
];

const TECHS = [
  'Digital Infrastructure',
  'Managed Wi-Fi',
  'Video Surveillance',
  'Access Control',
  'Smart Apartment IoT',
  'Audio/Video',
  'EV Charging',
];

function CtaButtons({ light = false }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/dashboard"
        className={
          light
            ? 'inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition-transform hover:-translate-y-0.5'
            : 'inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-transform hover:-translate-y-0.5'
        }
      >
        <LogIn size={16} /> Existing Partners — Log In
      </Link>
      <PartnerContactButton variant={light ? 'light' : 'hero'} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-800">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 text-white">
              <Layers size={16} />
            </span>
            <span className="text-base font-bold tracking-tight text-slate-900">FSG OS</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            >
              <LogIn size={14} /> Existing Partners — Log In
            </Link>
            <PartnerContactButton variant="header" className="max-sm:hidden" />
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            For technology integrators
          </p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Run your entire integration business on{' '}
            <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              one platform
            </span>
            .
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Quote multi-vendor systems, win the proposal, deliver the project, support the
            property, and bill the work — with one login and one source of truth instead of five
            disconnected tools.
          </p>
          <div className="mt-7">
            <CtaButtons />
          </div>
          <div className="mt-8 flex flex-wrap gap-1.5">
            {TECHS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Stylized product frame */}
        <div aria-hidden className="relative hidden lg:block">
          <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-600/15 to-cyan-600/15 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
            <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[10px] text-slate-400">os.fusionsg.com</span>
            </div>
            <div className="flex">
              <div className="w-32 shrink-0 space-y-1.5 border-r border-slate-100 bg-gradient-to-b from-blue-700 to-cyan-700 p-3">
                {['Dashboard', 'CRM', 'Builder', 'Proposals', 'Projects', 'Support', 'Invoices'].map((n, i) => (
                  <div
                    key={n}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium ${i === 2 ? 'bg-white/20 text-white' : 'text-white/70'}`}
                  >
                    {n}
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Pipeline', '$412k'],
                    ['Active projects', '9'],
                    ['Open tickets', '4'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm">
                      <p className="text-[9px] uppercase tracking-wide text-slate-400">{k}</p>
                      <p className="text-sm font-bold text-slate-800">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Wi-Fi — Option A vs Option B
                  </p>
                  {[
                    ['w-3/4', 'from-blue-500 to-cyan-500'],
                    ['w-2/3', 'from-slate-300 to-slate-400'],
                  ].map(([w, g], i) => (
                    <div key={i} className="mb-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full ${w} rounded-full bg-gradient-to-r ${g}`} />
                    </div>
                  ))}
                  <div className="mt-2 space-y-1">
                    {['Site survey', 'Install APs', 'Commission & handoff'].map((t, i) => (
                      <div key={t} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <CheckCircle2 size={11} className={i < 2 ? 'text-emerald-500' : 'text-slate-300'} />
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modules ── */}
      <section className="border-t border-slate-200/70 bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Every module your business runs on
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Eight modules that share one database — so the quote knows the customer, the project
            knows the quote, and the invoice knows them all.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ icon: Icon, name, blurb }) => (
              <div
                key={name}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 text-white">
                  <Icon size={18} />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
                <p className="mt-1 text-sm text-slate-500">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Flow ── */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            From first call to final invoice
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            The platform mirrors how integration work actually moves — each stage hands off to the
            next automatically.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {FLOW.map(({ step, text }, i) => (
              <div key={step} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{step}</span>
                  {i < FLOW.length - 1 && (
                    <ArrowRight size={14} className="ml-auto text-slate-300 max-md:hidden" />
                  )}
                </div>
                <p className="text-sm text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Differentiators ── */}
      <section className="border-t border-slate-200/70 bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Built for the way integrators actually sell
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                icon: GitCompareArrows,
                title: 'Multi-vendor, A/B quoting',
                text: 'Carry competing manufacturers per technology and build the same design against both — the customer gets a clean Option A / Option B decision, you keep one quote.',
              },
              {
                icon: Calculator,
                title: 'Design calculators, not spreadsheets',
                text: 'Enter rooms, ratios, and device counts; get a complete bill of materials with switching, licensing, cabling, and labor hours computed for you.',
              },
              {
                icon: Workflow,
                title: 'Proposal to project, automatically',
                text: 'An accepted proposal spawns the project with a technology-specific task plan, schedule with dependencies, and an equipment/labor budget split.',
              },
              {
                icon: ShieldCheck,
                title: 'Accountability built in',
                text: 'Assignments notify the right person and stay flagged until acted on. Roles include a true view-only seat, and admins can see who is actually using the platform.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modular + white-label ── */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Puzzle size={18} />
              </span>
              <h3 className="text-lg font-semibold text-slate-900">Modular by design</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Every module can be switched on or off per team. Start with quoting and proposals,
                add project delivery when you are ready, bring support and invoicing in when the
                business calls for it — the platform grows with you instead of overwhelming you.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Palette size={18} />
              </span>
              <h3 className="text-lg font-semibold text-slate-900">Wears your brand</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Your name in the corner, your logo, your colors — across the app, the customer
                proposals, and the exported documents. To your team and your customers, this is
                your platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-3xl bg-gradient-to-r from-blue-700 to-cyan-600 p-10 text-white shadow-xl shadow-blue-700/20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            One platform. Every job, end to end.
          </h2>
          <p className="mt-2 max-w-xl text-white/85">
            Already a partner? Your workspace is one click away. Curious what FSG OS could do for
            your integration business? We would love to talk.
          </p>
          <div className="mt-6">
            <CtaButtons light />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200/70 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-slate-400">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-cyan-600 text-white">
              <Layers size={12} />
            </span>
            © {new Date().getFullYear()} Fusion Solutions Group
          </span>
          <a href={CONTACT_MAILTO} className="hover:text-blue-600">
            david.shake@fusionsg.com
          </a>
        </div>
      </footer>
    </div>
  );
}
