// Custom Modules, Phase A: stock (default) config per module + the merge
// that applies a variant's overlay. A variant with an empty config IS the
// stock module — cloning is "snapshot by reference to these defaults", so
// stock improvements flow into variants unless a knob was overridden.
//
// Phase A knobs: `label` (sidebar + page header name) and a `terms`
// dictionary (entity names modules will consume as phases B/C wire them in).
// Later phases extend these shapes per module (CRM stages, board columns,
// feature toggles, custom fields) — additive, so stored configs stay valid.

export const DEFAULT_MODULE_CONFIG = {
  dashboard: { label: 'Dashboard', terms: {} },
  messages: { label: 'Messages', terms: {} },
  crm: {
    label: 'CRM',
    terms: { customer: 'Customer', customers: 'Customers', pipeline: 'Pipeline' },
  },
  builder: { label: 'System Builder', terms: { proposal: 'Proposal', proposals: 'Proposals' } },
  projects: {
    label: 'Projects',
    terms: { project: 'Project', projects: 'Projects', task: 'Task', tasks: 'Tasks' },
  },
  support: {
    label: 'Customer Support',
    terms: { case: 'Case', cases: 'Cases' },
  },
  invoices: {
    label: 'Invoices',
    terms: { invoice: 'Invoice', invoices: 'Invoices' },
  },
  resources: { label: 'Resources', terms: {} },
};

// Plain-object deep merge; arrays and scalars replace wholesale (a variant
// that redefines a list — e.g. future CRM stages — means exactly that list).
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(base) || !isObj(override)) return override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

// The config a team actually runs for a module: stock defaults overlaid with
// its assigned variant's config (null/undefined variant = stock).
export function resolveModuleConfig(moduleKey, variantConfig = null) {
  const base = DEFAULT_MODULE_CONFIG[moduleKey] ?? { label: moduleKey, terms: {} };
  return deepMerge(base, variantConfig ?? {});
}
