import { describe, it, expect } from 'vitest';
import { DEFAULT_MODULE_CONFIG, deepMerge, resolveModuleConfig } from '../lib/moduleConfig';

describe('deepMerge', () => {
  it('overlays nested objects without losing sibling keys', () => {
    const out = deepMerge({ a: { x: 1, y: 2 }, b: 3 }, { a: { y: 9 } });
    expect(out).toEqual({ a: { x: 1, y: 9 }, b: 3 });
  });

  it('replaces arrays and scalars wholesale', () => {
    expect(deepMerge({ list: [1, 2], n: 1 }, { list: [9], n: 2 })).toEqual({ list: [9], n: 2 });
  });

  it('null/undefined overlays keep the base', () => {
    expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });
});

describe('resolveModuleConfig', () => {
  it('an empty variant config is a faithful clone of stock', () => {
    expect(resolveModuleConfig('projects', {})).toEqual(DEFAULT_MODULE_CONFIG.projects);
    expect(resolveModuleConfig('projects', null)).toEqual(DEFAULT_MODULE_CONFIG.projects);
  });

  it('a label override renames the module but keeps stock terms', () => {
    const cfg = resolveModuleConfig('projects', { label: 'Jobs' });
    expect(cfg.label).toBe('Jobs');
    expect(cfg.terms.task).toBe('Task');
  });

  it('term overrides merge into the stock dictionary', () => {
    const cfg = resolveModuleConfig('support', { label: 'Work Orders', terms: { cases: 'Work Orders' } });
    expect(cfg.terms.cases).toBe('Work Orders');
    expect(cfg.terms.case).toBe('Case'); // untouched sibling survives
  });

  it('unknown module keys degrade to a bare label', () => {
    expect(resolveModuleConfig('mystery').label).toBe('mystery');
  });

  it('stock CRM config carries the semantic won/lost stages and default knobs', () => {
    const crm = resolveModuleConfig('crm');
    expect(crm.stages.map((s) => s.id)).toContain('won');
    expect(crm.stages.map((s) => s.id)).toContain('lost');
    expect(crm.accountTypes.length).toBeGreaterThan(0);
    expect(crm.nextSteps.staleSentDays).toBe(7);
    expect(crm.cards.nextSteps).toBe(true);
  });

  it('a variant stage list replaces the stock list wholesale', () => {
    const crm = resolveModuleConfig('crm', {
      stages: [
        { id: 'st_lead', label: 'Lead', tone: 'info' },
        { id: 'won', label: 'Sold', tone: 'success' },
        { id: 'lost', label: 'Dead', tone: 'danger' },
      ],
    });
    expect(crm.stages.map((s) => s.id)).toEqual(['st_lead', 'won', 'lost']);
    expect(crm.accountTypes.length).toBeGreaterThan(0); // untouched knob keeps stock
  });
});
