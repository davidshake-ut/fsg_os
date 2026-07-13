-- Member profiles: job title + admin notes on team members, editable by
-- company admins from Platform Settings -> Members. The users_update RLS
-- policy (0004) already lets company_admins update their own team's rows,
-- so this is columns only.
alter table public.users
  add column if not exists title text,
  add column if not exists notes text;
