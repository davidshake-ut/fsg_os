-- 0055: per-member conversation flags for the Message Center.
--   archived      — moves the conversation into the member's Archived
--                   folder (their view only; the conversation lives on)
--   marked_unread — "save for later": renders unread again until the
--                   member next opens the conversation
-- Both live on conversation_members, whose 0049 viewer trigger already
-- permits self-row updates, so view-only members can file/flag too.

alter table public.conversation_members add column if not exists archived boolean not null default false;
alter table public.conversation_members add column if not exists marked_unread boolean not null default false;
