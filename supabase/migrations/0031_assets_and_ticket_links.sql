-- Minimal assets/devices table (enables "device history / repeat failure"
-- tracking for managed-services support), plus links from support_tickets
-- to the project and specific asset a ticket is about — today a ticket only
-- links to a crm_account, with no way to see "this AP has failed 3 times."

create table if not exists public.assets (
  id                 uuid        primary key default gen_random_uuid(),
  company_id         uuid        not null references public.companies(id) on delete cascade,
  crm_account_id     uuid        references public.crm_accounts(id) on delete set null,
  project_id         uuid        references public.psa_projects(id) on delete set null,
  name               text        not null,
  asset_type         text        not null default 'other'
                      check      (asset_type in ('access_point','camera','switch','gateway','nvr','other')),
  serial_number      text,
  mac_address        text,
  ip_address         text,
  location           text,
  install_date       date,
  warranty_expires   date,
  notes              text,
  created_by         uuid        references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists assets_company_idx on public.assets(company_id);
create index if not exists assets_project_idx on public.assets(project_id);
create index if not exists assets_account_idx on public.assets(crm_account_id);

alter table public.assets enable row level security;

create policy "assets_access" on public.assets
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

alter table public.support_tickets
  add column if not exists project_id uuid references public.psa_projects(id) on delete set null,
  add column if not exists asset_id   uuid references public.assets(id) on delete set null;

create index if not exists support_tickets_project_idx on public.support_tickets(project_id);
create index if not exists support_tickets_asset_idx   on public.support_tickets(asset_id);
