-- Per-user notifications (task assigned to you, change order approved,
-- support ticket assigned to you). Distinct from activity_log (0025), which
-- is a company-wide feed everyone sees — these are targeted at one recipient
-- and track read/unread.

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  verb        text        not null,
  entity_type text        not null,
  entity_id   uuid,
  label       text        not null,
  href        text,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

-- You only ever see your own notifications (super_admin can see all, same
-- convention as every other table). Insert is company-scoped rather than
-- self-scoped — the row is written by whoever triggered the event (e.g. the
-- person who assigned a task), for a different recipient.
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "notifications_insert" on public.notifications
  for insert with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid() or public.current_user_role() = 'super_admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');

create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid() or public.current_user_role() = 'super_admin');
