-- Company-wide activity feed, replacing the dashboard's hardcoded
-- "coming soon" placeholder. Lean by design: logs a handful of high-signal
-- lifecycle events (quote status, change-order status, invoice paid, new
-- project, new ticket) rather than every mutation in the app.

create table if not exists public.activity_log (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  actor_id    uuid        references public.users(id) on delete set null,
  verb        text        not null,
  entity_type text        not null,
  entity_id   uuid,
  label       text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_company_created_idx on public.activity_log(company_id, created_at desc);

alter table public.activity_log enable row level security;

create policy "activity_log_access" on public.activity_log
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');
