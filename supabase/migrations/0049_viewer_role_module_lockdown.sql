-- 0049: module control becomes super-admin-only + a 'viewer' (view-only) role.
--
-- 1) company_modules: drop the company-admin management policy — only the
--    platform super admin turns modules on/off for any team (David,
--    2026-07-13). Members keep SELECT (the app reads the config to know what
--    to render); the super_admin ALL policy from 0006 stays.
--
-- 2) 'viewer' role: users.role gains a fourth value alongside
--    user/company_admin/super_admin (the column is free text; the invite and
--    members API routes whitelist it). Write enforcement is DB-level via a
--    BEFORE trigger on every tenant business table — the RLS policies are
--    membership-based (company_id = current_user_company()) and rewriting
--    all of them would be far riskier than one function + one attach loop.
--    Service-role writes pass through (auth.uid() is null → role is null).
--    Deliberately NOT triggered:
--      users            — viewers may edit their own profile/preferences
--                         (role/company changes are admin-API-only anyway)
--      notifications    — viewers must mark their own notifications read
--      companies, company_modules, _migrations — already role-gated
--    conversation_members gets a variant that still allows self-row UPDATE
--    (mark a conversation read) and self-row DELETE (leave a conversation).
--
-- 3) Storage: the write-capable policies (KB uploads, message attachments,
--    proposal PDFs) are recreated with a viewer exclusion — triggers cannot
--    be attached to storage.objects on hosted Supabase.

-- ── 1) Modules: super admin only ──────────────────────────────────────────

drop policy if exists "company_admin_modules_own" on public.company_modules;

-- ── 2) Viewer write-block triggers ────────────────────────────────────────

create or replace function public.block_viewer_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() = 'viewer' then
    raise exception 'View-only role: this account cannot create, edit, or delete records.';
  end if;
  return coalesce(new, old);
end $$;

-- conversation_members variant: viewers may still mark their own
-- conversations read (UPDATE own row) and leave one (DELETE own row).
create or replace function public.block_viewer_writes_conv_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() is distinct from 'viewer' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.user_id = auth.uid() then
    return new;
  end if;
  if tg_op = 'DELETE' and old.user_id = auth.uid() then
    return old;
  end if;
  raise exception 'View-only role: this account cannot create, edit, or delete records.';
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'saved_projects','custom_products',
    'psa_projects','psa_milestones','psa_tasks','psa_time_entries','psa_task_checklist_items',
    'crm_accounts','crm_contacts','crm_contact_properties','properties',
    'support_tickets','support_comments',
    'kb_groups','kb_documents','resources',
    'project_technologies','project_templates','template_phases','template_tasks',
    'invoices','change_orders','assets','activity_log',
    'automation_rules','automation_runs',
    'conversations','messages'
  ] loop
    execute format('drop trigger if exists viewer_write_block on public.%I', t);
    execute format(
      'create trigger viewer_write_block before insert or update or delete on public.%I '
      || 'for each row execute function public.block_viewer_writes()',
      t
    );
  end loop;
end $$;

drop trigger if exists viewer_write_block on public.conversation_members;
create trigger viewer_write_block
  before insert or update or delete on public.conversation_members
  for each row execute function public.block_viewer_writes_conv_members();

-- ── 3) Storage write policies exclude viewers ─────────────────────────────

-- KB documents (0016) — was: any authenticated user may insert/delete.
drop policy if exists "kb_insert" on storage.objects;
create policy "kb_insert" on storage.objects for insert
  with check (
    bucket_id = 'kb-documents'
    and auth.role() = 'authenticated'
    and public.current_user_role() is distinct from 'viewer'
  );

drop policy if exists "kb_delete" on storage.objects;
create policy "kb_delete" on storage.objects for delete
  using (
    bucket_id = 'kb-documents'
    and auth.role() = 'authenticated'
    and public.current_user_role() is distinct from 'viewer'
  );

-- Message attachments (0039) — membership-gated, now also viewer-excluded.
drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
    and public.current_user_role() is distinct from 'viewer'
  );

-- Proposal PDFs (0046) — company-gated, now also viewer-excluded.
drop policy if exists "proposal_files_insert" on storage.objects;
create policy "proposal_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
    and public.current_user_role() is distinct from 'viewer'
  );

drop policy if exists "proposal_files_update" on storage.objects;
create policy "proposal_files_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
    and public.current_user_role() is distinct from 'viewer'
  )
  with check (
    bucket_id = 'proposal-files'
    and ((storage.foldername(name))[1])::uuid = public.current_user_company()
    and public.current_user_role() is distinct from 'viewer'
  );
