-- Message Center Tier 2: full-text message search + a select-policy fix
-- found during Tier 1 verification.

-- ── Policy fixes ──────────────────────────────────────────────────────────
-- 1. Creators can always see conversations they created. Without this, a
--    brand-new conversation is invisible even to its creator until their
--    member row lands (blocked INSERT ... RETURNING; the app currently
--    works around it with client-generated ids + no RETURNING — this makes
--    the policy itself correct instead).
-- 2. Project channels are DISCOVERABLE company-wide (projects themselves
--    are company-wide in this app's access model) — anyone in the company
--    can see that a project's channel exists and join it (policy below);
--    reading/sending MESSAGES still requires membership. Without this, a
--    non-member can't find the existing channel and would create a
--    duplicate.
drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    public.is_conversation_member(id)
    or created_by = auth.uid()
    or (type = 'project' and company_id = public.current_user_company())
    or public.current_user_role() = 'super_admin'
  );

-- Membership check for "is this a project channel in my company" from
-- another table's policy — security definer for the same RLS-recursion
-- reason as is_conversation_member (see 0035).
create or replace function public.is_company_project_channel(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation_id
      and type = 'project'
      and company_id = (select company_id from public.users where id = auth.uid())
  );
$$;

-- Self-join to a company project channel (third insert path, alongside
-- creator-seats-self and member-adds-others from 0035).
drop policy if exists "conversation_members_insert" on public.conversation_members;
create policy "conversation_members_insert" on public.conversation_members
  for insert with check (
    (user_id = auth.uid() and public.created_conversation(conversation_id))
    or public.is_conversation_member(conversation_id)
    or (user_id = auth.uid() and public.is_company_project_channel(conversation_id))
    or public.current_user_role() = 'super_admin'
  );

-- One channel per project — guards the create/create race two users could
-- hit opening a channel for the same project simultaneously (loser gets a
-- 23505, which the app handles by re-querying and joining).
create unique index if not exists conversations_project_unique
  on public.conversations(project_id) where type = 'project';

-- ── Search RPC ────────────────────────────────────────────────────────────
-- Same approach as search_resources (0017): websearch_to_tsquery +
-- ts_rank_cd + ts_headline over the generated messages.content_ts column
-- (tsvector + GIN index shipped in 0035). Scoped inside the function body
-- to conversations the caller is a member of — security definer bypasses
-- RLS, so the membership check here is the access control.
create or replace function public.search_messages(
  p_query           text,
  p_conversation_id uuid default null,
  p_sender_id       uuid default null
)
returns table (
  id               uuid,
  conversation_id  uuid,
  sender_id        uuid,
  sender_name      text,
  sender_email     text,
  conversation_name text,
  conversation_type text,
  body             text,
  created_at       timestamptz,
  rank             real,
  headline         text
)
language sql stable security definer set search_path = public
as $$
  select
    m.id, m.conversation_id, m.sender_id,
    u.full_name as sender_name,
    u.email as sender_email,
    c.name as conversation_name,
    c.type as conversation_type,
    m.body, m.created_at,
    ts_rank_cd(m.content_ts, q)::real as rank,
    ts_headline(
      'english',
      m.body,
      q,
      'StartSel=⟦, StopSel=⟧, MaxWords=40, MinWords=15, MaxFragments=2, FragmentDelimiter= … '
    ) as headline
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.users u on u.id = m.sender_id,
  websearch_to_tsquery('english', p_query) q
  where
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
    )
    and m.content_ts @@ q
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and (p_sender_id       is null or m.sender_id       = p_sender_id)
  order by ts_rank_cd(m.content_ts, q) desc, m.created_at desc
  limit 50;
$$;
