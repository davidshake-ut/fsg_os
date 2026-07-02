-- Team-level settings (admin-managed, e.g. builder defaults) and per-user
-- preference overrides. Replaces localStorage-only builder defaults so they
-- follow the user across devices and can be set team-wide.
--
-- companies.settings is writable by team admins via the existing
-- companies_update policy. users.preferences must NOT get a self-update RLS
-- policy (that would let users edit their own role/company_id — RLS cannot
-- restrict columns), so writes go through a security-definer RPC that only
-- touches the preferences column.

alter table public.companies
  add column if not exists settings jsonb not null default '{}';

alter table public.users
  add column if not exists preferences jsonb not null default '{}';

create or replace function public.set_own_preferences(prefs jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users set preferences = prefs where id = auth.uid();
$$;

revoke all on function public.set_own_preferences(jsonb) from public;
grant execute on function public.set_own_preferences(jsonb) to authenticated;
