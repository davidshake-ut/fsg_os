-- Task dependencies ("blocked by"), stored as a simple array of task ids
-- rather than a join table — dependencies are sparse (a handful per task)
-- and don't carry their own metadata, so a join table + its own RLS policy
-- would be pure overhead here. No DB-level FK on array elements (Postgres
-- doesn't support that) — the UI/Gantt filter out ids that no longer
-- resolve to a real task (e.g. after a deletion).

alter table public.psa_tasks
  add column if not exists depends_on uuid[] not null default '{}';
