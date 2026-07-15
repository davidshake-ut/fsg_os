-- 0053: per-project Kanban columns. psa_projects.board_columns holds the
-- column list ([{id,label}]; null = the classic To Do / In Progress / Done);
-- tasks keep storing the column id in psa_tasks.status, so the fixed CHECK
-- from 0007 has to go — 'todo' and 'done' remain permanent anchors enforced
-- by the app (lib/boardColumns.js), custom columns use col_<uuid8> ids.

alter table public.psa_projects add column if not exists board_columns jsonb;

alter table public.psa_tasks drop constraint if exists psa_tasks_status_check;
