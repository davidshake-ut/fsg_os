import { describe, it, expect } from 'vitest';
import { DEFAULT_MODULE_CONFIG, deepMerge, resolveModuleConfig } from '../lib/moduleConfig';
import { resolveBoardColumns, DEFAULT_BOARD_COLUMNS } from '../lib/boardColumns';

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

  it('stock projects/support/invoices configs carry the Phase C knobs', () => {
    const p = resolveModuleConfig('projects');
    expect(p.features).toEqual({ gantt: true, dependencies: true, checklists: true, budgetSplit: true });
    expect(p.defaultColumns).toBeNull();
    const s = resolveModuleConfig('support');
    expect(s.statuses.resolved).toBe('Resolved');
    expect(s.priorities.critical).toBe('Critical');
    const i = resolveModuleConfig('invoices');
    expect(i.numberPrefix).toBe('INV');
    expect(i.tax.stateEnabled).toBe(false);
  });

  it('variant feature toggles merge without clobbering siblings', () => {
    const p = resolveModuleConfig('projects', { features: { gantt: false } });
    expect(p.features.gantt).toBe(false);
    expect(p.features.dependencies).toBe(true);
  });

  it('custom field definitions default empty and replace wholesale (Phase D)', () => {
    for (const key of ['crm', 'projects', 'support', 'invoices']) {
      expect(resolveModuleConfig(key).fields).toEqual([]);
    }
    const defs = [{ key: 'cf_permit', label: 'Permit #', type: 'text', options: [] }];
    const cfg = resolveModuleConfig('projects', { fields: defs });
    expect(cfg.fields).toEqual(defs);
    expect(cfg.features.gantt).toBe(true); // sibling knobs keep stock
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

describe('resolveBoardColumns with a variant fallback', () => {
  const VARIANT_COLS = [
    { id: 'todo', label: 'Backlog' },
    { id: 'col_rough', label: 'Rough-In' },
    { id: 'col_trim', label: 'Trim-Out' },
    { id: 'done', label: 'Complete' },
  ];

  it('a project with no saved columns takes the variant defaults', () => {
    expect(resolveBoardColumns({ board_columns: null }, VARIANT_COLS)).toEqual(VARIANT_COLS);
  });

  it('a project with saved columns ignores the variant defaults', () => {
    const saved = [{ id: 'todo', label: 'To Do' }, { id: 'done', label: 'Done' }];
    expect(resolveBoardColumns({ board_columns: saved }, VARIANT_COLS)).toEqual(saved);
  });

  it('variant defaults missing the anchors get them re-added', () => {
    const cols = resolveBoardColumns({}, [{ id: 'col_x', label: 'Only Middle' }]);
    expect(cols[0].id).toBe('todo');
    expect(cols[cols.length - 1].id).toBe('done');
  });

  it('no variant, no saved → stock columns (legacy behavior)', () => {
    expect(resolveBoardColumns({})).toEqual(DEFAULT_BOARD_COLUMNS);
    expect(resolveBoardColumns(null, undefined)).toEqual(DEFAULT_BOARD_COLUMNS);
  });
});
