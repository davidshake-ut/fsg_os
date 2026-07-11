-- Message Center: direct messages, self-service group channels, and
-- project-linked channels, with searchable history (search RPC added in a
-- later migration once the search UI ships).
--
-- This is the first feature in this schema requiring genuine
-- conversation-membership RLS — every other table is scoped company-wide
-- (company_id = current_user_company()). A raw correlated subquery on
-- conversation_members from within conversation_members' own policies (or
-- conversations' policies reading conversation_members) would recurse
-- through RLS on every read. The fix, matching this schema's existing
-- current_user_company()/current_user_role() pattern (0001_init.sql), is
-- two small `security definer` helper functions that bypass RLS for their
-- own internal lookup, breaking the recursive chain.

create table if not exists public.conversations (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references public.companies(id) on delete cascade,
  type       text        not null check (type in ('dm', 'group', 'project')),
  name       text,
  project_id uuid        references public.psa_projects(id) on delete cascade,
  created_by uuid        references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  user_id         uuid        not null references public.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  company_id      uuid        not null references public.companies(id) on delete cascade,
  sender_id       uuid        references public.users(id) on delete set null,
  body            text        not null check (char_length(body) between 1 and 8000),
  created_at      timestamptz not null default now(),
  content_ts tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored
);

create index if not exists conversations_company_updated_idx on public.conversations(company_id, updated_at desc);
create index if not exists conversations_project_idx on public.conversations(project_id) where project_id is not null;
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists conversation_members_conversation_idx on public.conversation_members(conversation_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists messages_fts on public.messages using gin(content_ts);

-- ── RLS bypass helpers (security definer — see header comment) ────────────

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

create or replace function public.created_conversation(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation_id and created_by = auth.uid()
  );
$$;

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- ── conversations ──────────────────────────────────────────────────────
create policy "conversations_select" on public.conversations
  for select using (
    public.is_conversation_member(id) or public.current_user_role() = 'super_admin'
  );

create policy "conversations_insert" on public.conversations
  for insert with check (
    company_id = public.current_user_company() and created_by = auth.uid()
  );

create policy "conversations_update" on public.conversations
  for update using (
    public.is_conversation_member(id) or public.current_user_role() = 'super_admin'
  )
  with check (
    company_id = public.current_user_company() or public.current_user_role() = 'super_admin'
  );

-- ── conversation_members ───────────────────────────────────────────────
-- Bootstrap: a brand-new conversation has no members yet, so "you must
-- already be a member to add a member" can't be the only insert rule or
-- nobody could ever seat themselves in their own new conversation. The
-- creator may seat themselves (created_conversation()); any existing
-- member may add others — self-service, matches the Slack-like model.
create policy "conversation_members_select" on public.conversation_members
  for select using (
    public.is_conversation_member(conversation_id) or public.current_user_role() = 'super_admin'
  );

create policy "conversation_members_insert" on public.conversation_members
  for insert with check (
    (user_id = auth.uid() and public.created_conversation(conversation_id))
    or public.is_conversation_member(conversation_id)
    or public.current_user_role() = 'super_admin'
  );

-- Mark-as-read (last_read_at) — only ever your own row.
create policy "conversation_members_update" on public.conversation_members
  for update using (user_id = auth.uid() or public.current_user_role() = 'super_admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'super_admin');

-- Leave a conversation (self) or remove someone else (any existing member).
create policy "conversation_members_delete" on public.conversation_members
  for delete using (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or public.current_user_role() = 'super_admin'
  );

-- ── messages ───────────────────────────────────────────────────────────
create policy "messages_select" on public.messages
  for select using (
    public.is_conversation_member(conversation_id) or public.current_user_role() = 'super_admin'
  );

create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and company_id = public.current_user_company()
    and public.is_conversation_member(conversation_id)
  );
