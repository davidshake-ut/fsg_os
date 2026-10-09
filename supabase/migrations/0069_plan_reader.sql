-- Plan reader: AI-powered plan-set upload and takeoff, ported from the
-- PlanScope prototype (github.com/davidshake-ut/planscope) into the Builder
-- tab. Architecture differs from PlanScope on purpose: no Prisma, no
-- Clerk, no Inngest — plain Supabase tables + storage, and the multi-step
-- pipeline (ingest -> classify -> [user selects pages] -> extract -> chat)
-- is driven by sequential API route calls from the client instead of a
-- background job queue, matching how the rest of this app works.
--
-- Chain: a plan set belongs to exactly one Builder quote (saved_projects),
-- same as everything else the Builder produces. company_id lives on
-- plan_sets only (top-level entity, same pattern as psa_projects in
-- 0012/0037); every child table scopes through it via EXISTS, same pattern
-- as psa_milestones/psa_tasks scoping through psa_projects.

create table if not exists public.plan_sets (
  id               uuid        primary key default gen_random_uuid(),
  company_id       uuid        not null references public.companies(id) on delete cascade,
  saved_project_id uuid        not null references public.saved_projects(id) on delete cascade,
  file_name        text        not null,
  storage_path     text        not null,
  sha256           text,
  page_count       int         not null default 0,
  status           text        not null default 'uploaded',
  error            text,
  uploaded_by      uuid        references public.users(id) on delete set null,
  uploaded_at      timestamptz not null default now(),
  constraint plan_sets_status_check check (status in ('uploaded', 'ingesting', 'ready', 'classifying', 'failed'))
);

create index if not exists plan_sets_quote_idx on public.plan_sets(saved_project_id);
create index if not exists plan_sets_company_idx on public.plan_sets(company_id);

create table if not exists public.plan_sheets (
  id              uuid primary key default gen_random_uuid(),
  plan_set_id     uuid not null references public.plan_sets(id) on delete cascade,
  page_number     int  not null,
  thumbnail_path  text,
  detail_path     text,
  text_layer      text,
  sheet_number    text,
  title           text,
  discipline      text,
  unique (plan_set_id, page_number)
);

create index if not exists plan_sheets_plan_set_idx on public.plan_sheets(plan_set_id);

create table if not exists public.plan_legends (
  id                  uuid        primary key default gen_random_uuid(),
  plan_set_id         uuid        not null references public.plan_sets(id) on delete cascade,
  trade               text        not null,
  symbols             jsonb       not null default '[]',
  source_page_numbers int[]       not null default '{}',
  created_at          timestamptz not null default now(),
  unique (plan_set_id, trade)
);

create table if not exists public.plan_analyses (
  id             uuid        primary key default gen_random_uuid(),
  plan_set_id    uuid        not null references public.plan_sets(id) on delete cascade,
  trades         text[]      not null,
  selected_pages int[]       not null default '{}',
  status         text        not null default 'queued',
  model          text,
  cost_usd       numeric(10, 4) not null default 0,
  error          text,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  constraint plan_analyses_status_check check (status in ('queued', 'running', 'review', 'completed', 'failed'))
);

create index if not exists plan_analyses_plan_set_idx on public.plan_analyses(plan_set_id);

create table if not exists public.plan_findings (
  id              uuid        primary key default gen_random_uuid(),
  analysis_id     uuid        not null references public.plan_analyses(id) on delete cascade,
  trade           text        not null,
  category        text        not null,
  symbol          text,
  description     text        not null,
  count           int         not null default 1,
  confidence      numeric(4, 3),
  location_hint   text,
  source_sheet_id uuid        references public.plan_sheets(id) on delete set null,
  source          text        not null default 'extracted',
  status          text        not null default 'pending_review',
  notes           text,
  created_at      timestamptz not null default now(),
  constraint plan_findings_status_check check (status in ('pending_review', 'approved', 'rejected', 'adjusted', 'derived'))
);

create index if not exists plan_findings_analysis_idx on public.plan_findings(analysis_id);

create table if not exists public.plan_site_inventory (
  analysis_id     uuid primary key references public.plan_analyses(id) on delete cascade,
  buildings       jsonb not null default '[]',
  common_areas    jsonb not null default '[]',
  outdoor_spaces  jsonb not null default '[]',
  elevators_count int   not null default 0,
  notes           jsonb
);

create table if not exists public.plan_chat_messages (
  id           uuid        primary key default gen_random_uuid(),
  plan_set_id  uuid        not null references public.plan_sets(id) on delete cascade,
  role         text        not null,
  content      text        not null,
  citations    jsonb,
  created_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint plan_chat_messages_role_check check (role in ('user', 'assistant'))
);

create index if not exists plan_chat_messages_plan_set_idx on public.plan_chat_messages(plan_set_id, created_at);

-- ============================================================ RLS ==============

alter table public.plan_sets           enable row level security;
alter table public.plan_sheets         enable row level security;
alter table public.plan_legends        enable row level security;
alter table public.plan_analyses       enable row level security;
alter table public.plan_findings       enable row level security;
alter table public.plan_site_inventory enable row level security;
alter table public.plan_chat_messages  enable row level security;

create policy "plan_sets_access" on public.plan_sets
  for all
  using (
    company_id = public.current_user_company()
    or public.current_user_role() = 'super_admin'
  )
  with check (
    company_id = public.current_user_company()
    or public.current_user_role() = 'super_admin'
  );

create policy "plan_sheets_access" on public.plan_sheets
  for all
  using (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_sheets.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_sheets.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

create policy "plan_legends_access" on public.plan_legends
  for all
  using (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_legends.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_legends.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

create policy "plan_analyses_access" on public.plan_analyses
  for all
  using (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_analyses.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_analyses.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

create policy "plan_findings_access" on public.plan_findings
  for all
  using (
    exists (
      select 1 from public.plan_analyses pa
      join public.plan_sets ps on ps.id = pa.plan_set_id
      where pa.id = plan_findings.analysis_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_analyses pa
      join public.plan_sets ps on ps.id = pa.plan_set_id
      where pa.id = plan_findings.analysis_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

create policy "plan_site_inventory_access" on public.plan_site_inventory
  for all
  using (
    exists (
      select 1 from public.plan_analyses pa
      join public.plan_sets ps on ps.id = pa.plan_set_id
      where pa.id = plan_site_inventory.analysis_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_analyses pa
      join public.plan_sets ps on ps.id = pa.plan_set_id
      where pa.id = plan_site_inventory.analysis_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

create policy "plan_chat_messages_access" on public.plan_chat_messages
  for all
  using (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_chat_messages.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.plan_sets ps
      where ps.id = plan_chat_messages.plan_set_id
        and (ps.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );

-- ======================================================== Storage =============
-- Private bucket, 200 MB per file — plan sets routinely run 50-150 MB, and
-- this bucket also holds the rasterized page thumbnail/detail PNGs (two per
-- page). Paths are <company_id>/<plan_set_id>/... (same folder-gated
-- pattern as 0046's proposal-files bucket).

insert into storage.buckets (id, name, public, file_size_limit)
values ('plan-sets', 'plan-sets', false, 209715200)
on conflict (id) do nothing;

drop policy if exists "plan_sets_files_insert" on storage.objects;
create policy "plan_sets_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plan-sets'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "plan_sets_files_update" on storage.objects;
create policy "plan_sets_files_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'plan-sets'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  )
  with check (
    bucket_id = 'plan-sets'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "plan_sets_files_select" on storage.objects;
create policy "plan_sets_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'plan-sets'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "plan_sets_files_delete" on storage.objects;
create policy "plan_sets_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'plan-sets'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );
