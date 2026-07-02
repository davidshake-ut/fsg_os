-- Quote lifecycle: saved_projects (quotes) gain a status workflow
-- (draft → sent → accepted/declined), revision lineage, and snapshot totals.
-- Change orders track post-acceptance scope changes on PSA projects.

alter table public.saved_projects
  add column if not exists status          text        not null default 'draft',
  add column if not exists version         int         not null default 1,
  add column if not exists parent_quote_id uuid        references public.saved_projects(id) on delete set null,
  add column if not exists sent_at         timestamptz,
  add column if not exists accepted_at     timestamptz,
  add column if not exists declined_at     timestamptz,
  add column if not exists valid_until     date,
  add column if not exists total_price     numeric(12,2),
  add column if not exists total_cost      numeric(12,2);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'saved_projects_status_check'
  ) then
    alter table public.saved_projects add constraint saved_projects_status_check
      check (status in ('draft','sent','accepted','declined','expired'));
  end if;
end $$;

create index if not exists saved_projects_status_idx on public.saved_projects(status);
create index if not exists saved_projects_parent_idx on public.saved_projects(parent_quote_id);

-- Change orders: billable scope changes against a delivered project.
-- Subtotal here is planning/budget data; billing still happens via invoices.
create table if not exists public.change_orders (
  id                   uuid          primary key default gen_random_uuid(),
  company_id           uuid          not null references public.companies(id) on delete cascade,
  project_id           uuid          not null references public.psa_projects(id) on delete cascade,
  quote_id             uuid          references public.saved_projects(id) on delete set null,
  co_number            int           not null,
  title                text          not null,
  description          text,
  status               text          not null default 'draft'
                       check (status in ('draft','submitted','approved','rejected')),
  line_items           jsonb         not null default '[]',
  subtotal             numeric(12,2) not null default 0,
  schedule_impact_days int           not null default 0,
  created_by           uuid          references public.users(id) on delete set null,
  approved_at          timestamptz,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

alter table public.change_orders enable row level security;

drop policy if exists "change_orders_access" on public.change_orders;
create policy "change_orders_access" on public.change_orders
  for all
  using  (company_id = public.current_user_company())
  with check (company_id = public.current_user_company());

create index if not exists change_orders_company_idx on public.change_orders(company_id);
create index if not exists change_orders_project_idx on public.change_orders(project_id);
