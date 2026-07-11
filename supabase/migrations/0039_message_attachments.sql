-- Message attachments — the app's first use of Supabase Storage. One
-- attachment per message (v1), stored in a private bucket with paths of
-- the form <conversation_id>/<uuid>-<filename>, so storage access control
-- reuses the same conversation-membership helper as the messages table.

-- ── messages: attachment columns; body becomes optional when a file is
--    attached (was: not null + 1..8000 chars) ─────────────────────────────
alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_type text;

alter table public.messages alter column body drop not null;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    char_length(coalesce(body, '')) <= 8000
    and (char_length(coalesce(body, '')) > 0 or attachment_path is not null)
  );

-- ── Private storage bucket (10 MB per file) ───────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('message-attachments', 'message-attachments', false, 10485760)
on conflict (id) do nothing;

-- ── Storage RLS — membership-gated via the path's leading folder, which
--    is the conversation id. is_conversation_member (0035) is security
--    definer, so it works from storage.objects policies too. No update/
--    delete policies: attachments are append-only, like messages. ─────────
drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
