import { describe, it, expect } from 'vitest';
import { deriveNextSteps } from '../lib/crmNextSteps';

const NOW = new Date('2026-07-22T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const base = {
  account: { id: 'a1', stage: 'proposal' },
  contacts: [{ id: 'c1' }],
  quotes: [{ id: 'q1', project_name: 'Wi-Fi', status: 'accepted', updated_at: daysAgo(2) }],
  projects: [{ id: 'p1', status: 'active' }],
  tickets: [],
  invoices: [],
};

describe('deriveNextSteps', () => {
  it('overdue invoices rank first, with the outstanding total', () => {
    const steps = deriveNextSteps({
      ...base,
      invoices: [
        { id: 'i1', invoice_number: 'INV-1042', status: 'overdue', total: 23045 },
        { id: 'i2', invoice_number: 'INV-1050', status: 'paid', total: 999 },
      ],
      quotes: [{ id: 'q1', project_name: 'Wi-Fi', status: 'sent', updated_at: daysAgo(10) }],
    }, NOW);
    expect(steps[0].id).toBe('overdue-invoices');
    expect(steps[0].tone).toBe('danger');
    expect(steps[0].detail).toContain('23,045');
    expect(steps[1].id).toBe('stale-quote-q1');
  });

  it('a sent proposal goes stale after 7 days and links to the Builder', () => {
    const fresh = deriveNextSteps({
      ...base,
      quotes: [{ id: 'q1', project_name: 'Wi-Fi', status: 'sent', updated_at: daysAgo(3) }],
    }, NOW);
    expect(fresh.some((s) => s.id.startsWith('stale-quote'))).toBe(false);

    const stale = deriveNextSteps({
      ...base,
      quotes: [{ id: 'q1', project_name: 'Wi-Fi', status: 'sent', updated_at: daysAgo(12) }],
    }, NOW);
    const step = stale.find((s) => s.id === 'stale-quote-q1');
    expect(step.tone).toBe('warning');
    expect(step.detail).toContain('12 days');
    expect(step.href).toBe('/builder?project=q1');
  });

  it('urgent unresolved cases surface; resolved ones do not', () => {
    const steps = deriveNextSteps({
      ...base,
      tickets: [
        { id: 't1', title: 'Old thing', status: 'resolved', priority: 'urgent', created_at: daysAgo(30) },
        { id: 't2', title: 'AP offline', status: 'open', priority: 'high', created_at: daysAgo(2) },
      ],
    }, NOW);
    const step = steps.find((s) => s.id === 'case-t2');
    expect(step).toBeTruthy();
    expect(step.href).toBe('/support/t2');
  });

  it('won with no project prompts a kickoff', () => {
    const steps = deriveNextSteps({ ...base, account: { id: 'a1', stage: 'won' }, projects: [] }, NOW);
    expect(steps.some((s) => s.id === 'won-no-project')).toBe(true);
  });

  it('empty accounts get getting-started nudges', () => {
    const steps = deriveNextSteps({ account: { id: 'a1', stage: 'new' }, contacts: [], quotes: [], projects: [], tickets: [], invoices: [] }, NOW);
    expect(steps.map((s) => s.id)).toEqual(['first-proposal', 'no-contacts']);
    expect(steps[0].href).toBe('/builder?account=a1');
  });

  it('a healthy account is "all caught up" and steps cap at 4', () => {
    expect(deriveNextSteps(base, NOW).map((s) => s.id)).toEqual(['all-clear']);

    const busy = deriveNextSteps({
      account: { id: 'a1', stage: 'won' },
      contacts: [],
      quotes: [{ id: 'q1', project_name: 'A', status: 'sent', updated_at: daysAgo(20) }],
      projects: [],
      tickets: [{ id: 't1', title: 'Hot', status: 'open', priority: 'urgent', created_at: daysAgo(1) }],
      invoices: [{ id: 'i1', invoice_number: 'INV-1', status: 'overdue', total: 100 }],
    }, NOW);
    expect(busy.length).toBeLessThanOrEqual(4);
    expect(busy[0].id).toBe('overdue-invoices');
  });
});
