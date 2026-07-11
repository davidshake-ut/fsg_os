-- Message Center Tier 3: enable Supabase Realtime (Postgres Changes) for
-- live message delivery — the app's first real-time infrastructure.
--
-- Adding a table to the supabase_realtime publication makes its INSERT/
-- UPDATE/DELETE events available to websocket subscribers. Authorization is
-- NOT publication-level: Realtime enforces each subscriber's RLS per event
-- (WALRUS), so the membership policies from 0035/0037 already guarantee a
-- user only receives events for conversations they can see — same security
-- model as querying, carried over to push.
--
-- REPLICA IDENTITY FULL is required for RLS-filtered realtime on UPDATE/
-- DELETE events and for policies that reference non-PK columns (ours check
-- conversation_id / user_id). Default replica identity only ships the PK in
-- the WAL record, which would make those policy checks fail silently.

alter table public.messages             replica identity full;
alter table public.conversations        replica identity full;
alter table public.conversation_members replica identity full;
alter table public.notifications        replica identity full;

-- Idempotent-ish guard: adding a table already in the publication errors,
-- so drop first (swallowing "not in publication") to keep this re-runnable.
do $$
begin
  begin
    alter publication supabase_realtime drop table public.messages;
  exception when undefined_object or undefined_table then null;
  end;
  begin
    alter publication supabase_realtime drop table public.conversations;
  exception when undefined_object or undefined_table then null;
  end;
  begin
    alter publication supabase_realtime drop table public.conversation_members;
  exception when undefined_object or undefined_table then null;
  end;
  begin
    alter publication supabase_realtime drop table public.notifications;
  exception when undefined_object or undefined_table then null;
  end;
end $$;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.notifications;
