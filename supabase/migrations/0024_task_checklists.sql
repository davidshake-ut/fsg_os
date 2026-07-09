-- Checklist items inside a task (e.g. "site survey checklist"). Lighter than
-- full subtasks: no status rollup, no independent assignee/dates — just a
-- checkable line item. Denormalizes project_id (like psa_time_entries) so the
-- project-detail hook can fetch all of a project's checklist items in one
-- query instead of a second round-trip keyed off task ids.

create table if not exists public.psa_task_checklist_items (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references public.psa_projects(id) on delete cascade,
  task_id    uuid        not null references public.psa_tasks(id) on delete cascade,
  label      text        not null,
  is_done    boolean     not null default false,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists psa_task_checklist_items_task_idx on public.psa_task_checklist_items(task_id);
create index if not exists psa_task_checklist_items_project_idx on public.psa_task_checklist_items(project_id);

alter table public.psa_task_checklist_items enable row level security;

create policy "psa_task_checklist_items_access" on public.psa_task_checklist_items
  for all
  using (
    exists (
      select 1 from public.psa_projects p
      where p.id = psa_task_checklist_items.project_id
        and (p.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.psa_projects p
      where p.id = psa_task_checklist_items.project_id
        and (p.company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
    )
  );
