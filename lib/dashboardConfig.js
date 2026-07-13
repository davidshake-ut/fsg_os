// Per-team dashboard card registry. companies.dashboard_config holds
// { kpis: [ids], panels: [ids] } — presence means visible, array order is
// display order. Anything unknown is dropped on read so old configs survive
// card renames, and null/missing config falls back to the stock layout.

export const KPI_CARDS = {
  customers: { label: 'Total Customers' },
  projects:  { label: 'Active Projects' },
  revenue:   { label: 'Revenue Collected' },
  tickets:   { label: 'Open Tickets' },
  proposals: { label: 'Builder Proposals' },
  documents: { label: 'Documents' },
};

export const PANEL_CARDS = {
  active_projects: { label: 'Active Projects', column: 'left'  },
  pipeline:        { label: 'Pipeline',        column: 'left'  },
  active_tickets:  { label: 'Active Tickets',  column: 'right' },
  activity:        { label: 'Recent Activity', column: 'right' },
};

export const DEFAULT_DASHBOARD_CONFIG = {
  kpis:   ['customers', 'projects', 'revenue', 'tickets', 'proposals', 'documents'],
  panels: ['active_projects', 'pipeline', 'active_tickets', 'activity'],
};

// Sanitize a stored config: known ids only, de-duped, order preserved.
export function resolveDashboardConfig(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_DASHBOARD_CONFIG;
  const clean = (list, registry) =>
    [...new Set(Array.isArray(list) ? list : [])].filter((id) => registry[id]);
  return {
    kpis:   Array.isArray(raw.kpis)   ? clean(raw.kpis, KPI_CARDS)     : DEFAULT_DASHBOARD_CONFIG.kpis,
    panels: Array.isArray(raw.panels) ? clean(raw.panels, PANEL_CARDS) : DEFAULT_DASHBOARD_CONFIG.panels,
  };
}
