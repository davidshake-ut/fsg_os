-- Per-team dashboard composition: which cards show and in what order,
-- editable by each team's admin from the dashboard itself. Null means the
-- stock layout. Stored as jsonb so future per-team UI/UX knobs can join it
-- without another migration ({ kpis: [...], panels: [...] } today).
alter table public.companies
  add column if not exists dashboard_config jsonb;
