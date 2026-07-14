-- 0051: member access tracking — who is actually using the app.
--
-- users.last_seen_at powers the Members table's "last active" display;
-- access_log keeps one row per visit (the client throttles to at most one
-- row per user per hour) so admins can count visits over a period
-- (24h / 7d / 30d). Append-only from the app.
--
-- Deliberately NOT on the 0049 viewer write-block list: view-only members'
-- visits must record too (the insert policy is self-scoped anyway).

alter table public.users add column if not exists last_seen_at timestamptz;

create table if not exists public.access_log (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id) on delete cascade,
  user_id    uuid        not null references public.users(id) on delete cascade,
  seen_at    timestamptz not null default now()
);

create index if not exists access_log_company_seen_idx on public.access_log(company_id, seen_at desc);
create index if not exists access_log_user_seen_idx on public.access_log(user_id, seen_at desc);

alter table public.access_log enable row level security;

-- Everyone records only their own visits, inside their own team.
drop policy if exists "access_log_insert_self" on public.access_log;
create policy "access_log_insert_self" on public.access_log
  for insert with check (
    user_id = auth.uid() and company_id = public.current_user_company()
  );

-- Team admins read their team's visits; super admins read all.
drop policy if exists "access_log_admin_read" on public.access_log;
create policy "access_log_admin_read" on public.access_log
  for select using (
    (company_id = public.current_user_company() and public.current_user_role() = 'company_admin')
    or public.current_user_role() = 'super_admin'
  );

-- No update/delete policies — append-only from the app. Retention pruning
-- (e.g. rows older than ~180 days) can ride the service role later if
-- volume ever warrants it; at one row per user per active hour it won't
-- for a long time.
