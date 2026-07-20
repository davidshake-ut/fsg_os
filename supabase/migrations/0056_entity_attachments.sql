-- File attachments for projects and support cases. One row per file,
-- attached to exactly one parent entity. Files live in a private bucket
-- with paths of the form <company_id>/<uuid>-<filename>, so storage RLS
-- keys company membership off the leading path folder (same idea as
-- message-attachments in 0039, but company-scoped instead of
-- conversation-scoped).

create table if not exists public.attachments (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  project_id  uuid        references public.psa_projects(id) on delete cascade,
  ticket_id   uuid        references public.support_tickets(id) on delete cascade,
  uploaded_by uuid        references public.users(id) on delete set null,
  file_path   text        not null,
  file_name   text        not null,
  file_size   bigint,
  file_type   text,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(project_id, ticket_id) = 1)
);

create index if not exists attachments_project_idx on public.attachments (project_id);
create index if not exists attachments_ticket_idx  on public.attachments (ticket_id);

alter table public.attachments enable row level security;

drop policy if exists "attachments_access" on public.attachments;
create policy "attachments_access" on public.attachments
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

-- ── Private storage bucket (25 MB per file) ───────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('entity-attachments', 'entity-attachments', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "entity_attachments_insert" on storage.objects;
create policy "entity_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'entity-attachments'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "entity_attachments_select" on storage.objects;
create policy "entity_attachments_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'entity-attachments'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "entity_attachments_delete" on storage.objects;
create policy "entity_attachments_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'entity-attachments'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );
