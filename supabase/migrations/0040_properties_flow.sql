-- Lifecycle flow, Tier 1: the Property entity.
--
-- The sales chain is Account -> Property -> Proposal(versions) -> Project:
-- an account has many properties, a property has many proposals (revisions
-- of a proposal stay on the same property), and exactly ONE proposal per
-- property becomes the project — the accepted one. Until now "property"
-- was only a free-text name inside the quote's inputs jsonb; this makes it
-- a real record so the chain is carried by FKs instead of re-entered at
-- every stage.

create table if not exists public.properties (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  crm_account_id uuid        not null references public.crm_accounts(id) on delete cascade,
  name           text        not null,
  address        text,
  notes          text,
  created_by     uuid        references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists properties_account_idx on public.properties(crm_account_id);
create index if not exists properties_company_idx on public.properties(company_id);

alter table public.properties enable row level security;

create policy "properties_access" on public.properties
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

-- ── Carry the chain on proposals and projects ────────────────────────────
alter table public.saved_projects add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.psa_projects   add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.psa_projects   add column if not exists crm_account_id uuid references public.crm_accounts(id) on delete set null;

create index if not exists saved_projects_property_idx on public.saved_projects(property_id);
create index if not exists psa_projects_property_idx on public.psa_projects(property_id);
create index if not exists psa_projects_account_idx on public.psa_projects(crm_account_id);

-- One project per property (the accepted proposal's project). Same pattern
-- as conversations_project_unique (0037): losers of a create race get a
-- 23505 and the app links them to the existing project instead.
create unique index if not exists psa_projects_property_unique
  on public.psa_projects(property_id) where property_id is not null;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- For every existing quote that has an account, find-or-create a property
-- on that account named from the quote's inputs->>'propertyName' (fallback
-- to the quote's project_name), then link the quote to it. Projects inherit
-- property/account through their quote. Duplicate property names within an
-- account collapse to one property (that's the point of the entity).
insert into public.properties (company_id, crm_account_id, name)
select distinct
  sp.company_id,
  sp.crm_account_id,
  coalesce(nullif(trim(sp.inputs->>'propertyName'), ''), sp.project_name, 'Property')
from public.saved_projects sp
where sp.crm_account_id is not null
  and sp.company_id is not null
  and not exists (
    select 1 from public.properties p
    where p.crm_account_id = sp.crm_account_id
      and p.name = coalesce(nullif(trim(sp.inputs->>'propertyName'), ''), sp.project_name, 'Property')
  );

update public.saved_projects sp
set property_id = p.id
from public.properties p
where sp.property_id is null
  and sp.crm_account_id is not null
  and p.crm_account_id = sp.crm_account_id
  and p.name = coalesce(nullif(trim(sp.inputs->>'propertyName'), ''), sp.project_name, 'Property');

-- Projects inherit from their linked quote. The unique index above is
-- already in place, so if multiple projects share a property (possible in
-- old data where several quotes for one property each spawned a project),
-- only backfill the OLDEST project per property and leave the rest null
-- rather than failing the migration.
update public.psa_projects pj
set property_id = sp.property_id,
    crm_account_id = sp.crm_account_id
from public.saved_projects sp
where pj.quote_id = sp.id
  and pj.property_id is null
  and sp.property_id is not null
  and pj.id = (
    select pj2.id from public.psa_projects pj2
    join public.saved_projects sp2 on sp2.id = pj2.quote_id
    where sp2.property_id = sp.property_id
    order by pj2.created_at asc
    limit 1
  );

-- Any project without a property link still gets its account carried over.
update public.psa_projects pj
set crm_account_id = sp.crm_account_id
from public.saved_projects sp
where pj.quote_id = sp.id
  and pj.crm_account_id is null
  and sp.crm_account_id is not null;
