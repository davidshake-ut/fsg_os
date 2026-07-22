// Derives the "What to do next" actions for a CRM account's 360 page from
// its live records. Pure function; `now` is injectable for tests.
//
// Priority order (most severe first): overdue money, stale sent proposals,
// urgent unresolved cases, won-but-no-project, then getting-started nudges.
// Capped so the panel prescribes, never overwhelms.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STEPS = 4;
const STALE_SENT_DAYS = 7;

const daysSince = (iso, now) => Math.floor((now - new Date(iso).getTime()) / DAY_MS);

export function deriveNextSteps({ account, contacts = [], quotes = [], projects = [], tickets = [], invoices = [] }, now = Date.now()) {
  const steps = [];

  // 1. Overdue invoices — money on the table beats everything.
  const overdue = invoices.filter((i) => i.status === 'overdue');
  if (overdue.length > 0) {
    const total = overdue.reduce((s, i) => s + (Number(i.total) || 0), 0);
    steps.push({
      id: 'overdue-invoices',
      tone: 'danger',
      icon: 'invoice',
      title: overdue.length === 1
        ? `${overdue[0].invoice_number || overdue[0].title} is overdue`
        : `${overdue.length} invoices are overdue`,
      detail: `$${total.toLocaleString()} outstanding — send a payment reminder.`,
      href: '/invoices',
      cta: 'Invoices',
    });
  }

  // 2. Sent proposals with no movement.
  const staleSent = quotes
    .filter((q) => q.status === 'sent' && daysSince(q.updated_at, now) >= STALE_SENT_DAYS)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  if (staleSent.length > 0) {
    const q = staleSent[0];
    steps.push({
      id: `stale-quote-${q.id}`,
      tone: 'warning',
      icon: 'proposal',
      title: `Follow up on “${q.project_name}”`,
      detail: `Sent ${daysSince(q.updated_at, now)} days ago with no response.`,
      href: `/builder?project=${q.id}`,
      cta: 'Open',
    });
  }

  // 3. Urgent unresolved support cases.
  const hotCase = tickets.find(
    (t) => !['resolved', 'closed'].includes(t.status) && ['high', 'urgent'].includes(t.priority)
  );
  if (hotCase) {
    steps.push({
      id: `case-${hotCase.id}`,
      tone: 'warning',
      icon: 'case',
      title: `${hotCase.priority === 'urgent' ? 'Urgent' : 'High-priority'} case: “${hotCase.title}”`,
      detail: `Open ${daysSince(hotCase.created_at, now)} day${daysSince(hotCase.created_at, now) === 1 ? '' : 's'} — make sure it has an owner.`,
      href: `/support/${hotCase.id}`,
      cta: 'Case',
    });
  }

  // 4. Deal won but delivery hasn't started.
  if (account?.stage === 'won' && projects.length === 0) {
    steps.push({
      id: 'won-no-project',
      tone: 'info',
      icon: 'project',
      title: 'Deal won — kick off the project',
      detail: 'No project exists yet for this account.',
      href: '/projects',
      cta: 'Projects',
    });
  }

  // 5. Getting-started nudges (only when nothing above is burning).
  if (quotes.length === 0 && account?.stage !== 'lost') {
    steps.push({
      id: 'first-proposal',
      tone: 'info',
      icon: 'proposal',
      title: 'Create the first proposal',
      detail: 'Nothing quoted for this customer yet — start in the Builder.',
      href: `/builder?account=${account?.id ?? ''}`,
      cta: 'Builder',
    });
  }
  if (contacts.length === 0) {
    steps.push({
      id: 'no-contacts',
      tone: 'info',
      icon: 'contact',
      title: 'Add a contact',
      detail: 'No people on file — add who you talk to.',
      href: '#contacts',
      cta: 'Contacts',
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: 'all-clear',
      tone: 'success',
      icon: 'check',
      title: 'All caught up',
      detail: 'No overdue invoices, stale proposals, or urgent cases.',
      href: null,
      cta: null,
    });
  }

  return steps.slice(0, MAX_STEPS);
}
