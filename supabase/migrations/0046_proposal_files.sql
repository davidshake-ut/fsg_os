-- Proposal PDFs — "Create Proposal" in the Builder generates the customer
-- document (proposal + scope of work) and keeps a copy on the proposal
-- record, so the Proposals tab always carries what was actually sent.
-- Paths are <company_id>/<quote_id>/Proposal-vN.pdf; storage access is
-- company-gated via the leading path folder (same pattern as 0039's
-- conversation-gated message attachments).

alter table public.saved_projects
  add column if not exists pdf_path text;

-- Private bucket, 20 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('proposal-files', 'proposal-files', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "proposal_files_insert" on storage.objects;
create policy "proposal_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

-- Re-generating a version's PDF overwrites in place (upsert), so update is
-- allowed within the company prefix — unlike append-only chat attachments.
drop policy if exists "proposal_files_update" on storage.objects;
create policy "proposal_files_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  )
  with check (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );

drop policy if exists "proposal_files_select" on storage.objects;
create policy "proposal_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
  );
