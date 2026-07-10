-- Automation engine v1: user-defined trigger + conditions + actions rules,
-- plus a run log for auditability. Scope is deliberately event-driven only —
-- no cron/scheduled-job infrastructure exists in this app, so there is no
-- "due date approaching" or "SLA at risk" style time-based trigger; only
-- triggers that fire from an actual mutation the app already makes.

create table if not exists public.automation_rules (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references public.companies(id) on delete cascade,
  name         text        not null,
  enabled      boolean     not null default true,
  trigger_type text        not null,
  conditions   jsonb       not null default '[]',
  actions      jsonb       not null default '[]',
  created_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id           uuid        primary key default gen_random_uuid(),
  rule_id      uuid        references public.automation_rules(id) on delete cascade,
  company_id   uuid        not null references public.companies(id) on delete cascade,
  trigger_type text        not null,
  status       text        not null check (status in ('success', 'error')),
  detail       text,
  ran_at       timestamptz not null default now()
);

create index if not exists automation_rules_company_trigger_idx on public.automation_rules(company_id, trigger_type, enabled);
create index if not exists automation_runs_company_idx on public.automation_runs(company_id, ran_at desc);
create index if not exists automation_runs_rule_idx on public.automation_runs(rule_id, ran_at desc);

alter table public.automation_rules enable row level security;
alter table public.automation_runs  enable row level security;

create policy "automation_rules_access" on public.automation_rules
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

create policy "automation_runs_access" on public.automation_runs
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');
