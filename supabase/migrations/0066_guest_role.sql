-- 0066: 'guest' role — an external, account-scoped, view-only login.
--
-- A guest belongs to a team (users.company_id) like everyone else, but the
-- admin also assigns users.guest_account_id (a CRM account — typically the
-- customer company the guest works for). A guest sees ONLY the proposals,
-- projects, invoices, and support cases tied to that account, plus the data
-- needed to render them (their account row, its properties, project detail
-- children). Everything else — CRM, KB/resources, training, catalog,
-- activity, time entries — is invisible. Guests can write nothing.
--
-- Mechanics:
--   * Writes: the 0049 read-only trigger (attached to every tenant business
--     table) now also blocks 'guest'.
--   * Reads: RESTRICTIVE policies (AND-ed with the existing permissive
--     company policies) either scope a table to the guest's account or hide
--     it from guests entirely. Non-guest roles are unaffected.

-- ── users.guest_account_id ────────────────────────────────────────────────
alter table public.users
  add column if not exists guest_account_id uuid references public.crm_accounts(id) on delete set null;

-- The guest's account, or null for every other role. SECURITY DEFINER so
-- policies can call it regardless of users-table RLS.
create or replace function public.current_user_guest_account()
returns uuid language sql security definer stable set search_path = public as $$
  select guest_account_id from public.users where id = auth.uid() and role = 'guest';
$$;

-- ── Writes: guests are read-only everywhere ───────────────────────────────
create or replace function public.block_viewer_writes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() in ('viewer', 'guest') then
    raise exception 'View-only role: this account cannot create, edit, or delete records.';
  end if;
  return coalesce(new, old);
end $$;

-- Same as 0049's version, with guests blocked outright (viewers keep their
-- self-row mark-read/leave allowance).
create or replace function public.block_viewer_writes_conv_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() = 'guest' then
    raise exception 'View-only role: this account cannot create, edit, or delete records.';
  end if;
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

-- ── Reads: account-scoped tables ──────────────────────────────────────────
-- Pattern: non-guests pass automatically; guests only see their account.

drop policy if exists "guest_scope" on public.saved_projects;
create policy "guest_scope" on public.saved_projects as restrictive for select
  using (public.current_user_role() <> 'guest'
         or crm_account_id = public.current_user_guest_account());

drop policy if exists "guest_scope" on public.psa_projects;
create policy "guest_scope" on public.psa_projects as restrictive for select
  using (public.current_user_role() <> 'guest'
         or crm_account_id = public.current_user_guest_account());

drop policy if exists "guest_scope" on public.invoices;
create policy "guest_scope" on public.invoices as restrictive for select
  using (public.current_user_role() <> 'guest'
         or crm_account_id = public.current_user_guest_account());

drop policy if exists "guest_scope" on public.support_tickets;
create policy "guest_scope" on public.support_tickets as restrictive for select
  using (public.current_user_role() <> 'guest'
         or account_id = public.current_user_guest_account());

drop policy if exists "guest_scope" on public.assets;
create policy "guest_scope" on public.assets as restrictive for select
  using (public.current_user_role() <> 'guest'
         or crm_account_id = public.current_user_guest_account());

drop policy if exists "guest_scope" on public.properties;
create policy "guest_scope" on public.properties as restrictive for select
  using (public.current_user_role() <> 'guest'
         or crm_account_id = public.current_user_guest_account());

-- Their own account row only (joins render the account name).
drop policy if exists "guest_scope" on public.crm_accounts;
create policy "guest_scope" on public.crm_accounts as restrictive for select
  using (public.current_user_role() <> 'guest'
         or id = public.current_user_guest_account());

-- ── Reads: children scoped via their parent ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'psa_milestones', 'psa_tasks', 'psa_task_checklist_items',
    'project_technologies', 'change_orders'
  ] loop
    execute format('drop policy if exists "guest_scope" on public.%I', t);
    execute format(
      'create policy "guest_scope" on public.%I as restrictive for select using ('
      || 'public.current_user_role() <> ''guest'' or exists ('
      || '  select 1 from public.psa_projects p where p.id = %I.project_id'
      || '  and p.crm_account_id = public.current_user_guest_account()))', t, t);
  end loop;
end $$;

drop policy if exists "guest_scope" on public.support_comments;
create policy "guest_scope" on public.support_comments as restrictive for select
  using (public.current_user_role() <> 'guest'
         or exists (
           select 1 from public.support_tickets t
           where t.id = support_comments.ticket_id
             and t.account_id = public.current_user_guest_account()));

drop policy if exists "guest_scope" on public.attachments;
create policy "guest_scope" on public.attachments as restrictive for select
  using (public.current_user_role() <> 'guest'
         or exists (
           select 1 from public.psa_projects p
           where p.id = attachments.project_id
             and p.crm_account_id = public.current_user_guest_account())
         or exists (
           select 1 from public.support_tickets t
           where t.id = attachments.ticket_id
             and t.account_id = public.current_user_guest_account()));

-- ── Reads: invisible to guests entirely ───────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'crm_contacts', 'crm_contact_properties',
    'kb_groups', 'kb_documents', 'resources',
    'training_courses', 'training_course_items', 'training_assignments',
    'training_item_completions', 'training_certifications',
    'activity_log', 'psa_time_entries', 'custom_products', 'automations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "guest_hidden" on public.%I', t);
      execute format(
        'create policy "guest_hidden" on public.%I as restrictive for select '
        || 'using (public.current_user_role() <> ''guest'')', t);
    end if;
  end loop;
end $$;
