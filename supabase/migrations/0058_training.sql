-- Training & certifications (Resources > Training).
--
-- Five tables: courses, ordered course items (references to existing KB
-- documents / resources / external URLs — never copies), per-user course
-- assignments, item completions, and employee certifications.
--
-- Authorization is DELIBERATELY stricter than the house-standard coarse
-- company policy (approved 2026-07-27): course/assignment/certification
-- writes are company_admin-only, and completion rows can only be written by
-- their own user. Assignment status is never written by learners — a
-- security-definer trigger on item completions recalculates it server-side,
-- so progress cannot be manipulated from the client.

-- ── Courses ───────────────────────────────────────────────────────────────
create table if not exists public.training_courses (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references public.companies(id) on delete cascade,
  title             text        not null check (char_length(title) between 1 and 200),
  description       text,
  status            text        not null default 'draft'
                    check       (status in ('draft','published','archived')),
  category          text        not null default 'General',
  estimated_minutes int         check (estimated_minutes is null or estimated_minutes > 0),
  created_by        uuid        references public.users(id) on delete set null,
  published_at      timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists training_courses_co_status_idx
  on public.training_courses (company_id, status);

-- ── Course items — ordered references to existing content ─────────────────
create table if not exists public.training_course_items (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references public.companies(id) on delete cascade,
  course_id       uuid        not null references public.training_courses(id) on delete cascade,
  sort_order      int         not null default 0,
  title           text        not null check (char_length(title) between 1 and 200),
  description     text,
  item_type       text        not null check (item_type in ('kb_article','resource','external_url')),
  kb_document_id  uuid        references public.kb_documents(id) on delete cascade,
  resource_id     uuid        references public.resources(id) on delete cascade,
  external_url    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Exactly the reference matching the type. Referenced KB docs/resources
  -- cascade-delete the item (the admin UI warns before that happens).
  check (
    (item_type = 'kb_article'   and kb_document_id is not null and resource_id is null and external_url is null) or
    (item_type = 'resource'     and resource_id is not null and kb_document_id is null and external_url is null) or
    (item_type = 'external_url' and external_url is not null and kb_document_id is null and resource_id is null)
  )
);

create index if not exists training_course_items_course_idx
  on public.training_course_items (course_id, sort_order);

-- ── Assignments — one row per user per course ─────────────────────────────
create table if not exists public.training_assignments (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references public.companies(id) on delete cascade,
  course_id         uuid        not null references public.training_courses(id) on delete cascade,
  user_id           uuid        not null references public.users(id) on delete cascade,
  assignment_source text        not null default 'individual'
                    check       (assignment_source in ('individual','role','everyone')),
  source_reference  text,
  assigned_by       uuid        references public.users(id) on delete set null,
  assigned_at       timestamptz not null default now(),
  due_date          date,
  -- 'overdue' is always computed from due_date, never stored.
  status            text        not null default 'not_started'
                    check       (status in ('not_started','in_progress','completed')),
  started_at        timestamptz,
  completed_at      timestamptz,
  completed_by      uuid        references public.users(id) on delete set null, -- set on manual admin completion
  completion_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (course_id, user_id)
);

create index if not exists training_assignments_co_user_idx   on public.training_assignments (company_id, user_id);
create index if not exists training_assignments_co_course_idx on public.training_assignments (company_id, course_id);
create index if not exists training_assignments_co_due_idx    on public.training_assignments (company_id, due_date);

-- ── Item completions ──────────────────────────────────────────────────────
create table if not exists public.training_item_completions (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  assignment_id  uuid        not null references public.training_assignments(id) on delete cascade,
  course_item_id uuid        not null references public.training_course_items(id) on delete cascade,
  user_id        uuid        not null references public.users(id) on delete cascade,
  completed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (assignment_id, course_item_id)
);

create index if not exists training_completions_assignment_idx
  on public.training_item_completions (assignment_id);

-- ── Certifications ────────────────────────────────────────────────────────
create table if not exists public.training_certifications (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references public.companies(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  name         text        not null check (char_length(name) between 1 and 200),
  issuing_org  text,
  cert_number  text,
  issue_date   date,
  expiry_date  date,       -- null = non-expiring
  proof_path   text,       -- object path in the existing entity-attachments bucket (<company_id>/…)
  proof_name   text,
  notes        text,
  created_by   uuid        references public.users(id) on delete set null,
  updated_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (issue_date is null or expiry_date is null or expiry_date >= issue_date)
);

create index if not exists training_certs_co_user_idx   on public.training_certifications (company_id, user_id);
create index if not exists training_certs_co_expiry_idx on public.training_certifications (company_id, expiry_date);

-- ── Server-side progress recalculation ────────────────────────────────────
-- Learners never write training_assignments. Inserting/deleting their own
-- completion rows fires this trigger, which recomputes the parent
-- assignment's status/timestamps with owner privileges. Manual admin
-- completion writes the assignment directly (admin-only policy below).
create or replace function public.training_recalc_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid := coalesce(new.assignment_id, old.assignment_id);
  v_total int;
  v_done  int;
begin
  select count(*) into v_total
    from public.training_course_items i
    join public.training_assignments a on a.course_id = i.course_id
   where a.id = v_assignment_id;

  select count(*) into v_done
    from public.training_item_completions c
   where c.assignment_id = v_assignment_id;

  update public.training_assignments a
     set status = case
                    when v_total > 0 and v_done >= v_total then 'completed'
                    when v_done > 0 then 'in_progress'
                    else 'not_started'
                  end,
         started_at   = case when v_done > 0 then coalesce(a.started_at, now()) else null end,
         completed_at = case when v_total > 0 and v_done >= v_total then coalesce(a.completed_at, now()) else null end,
         completed_by = case when v_total > 0 and v_done >= v_total then a.completed_by else null end,
         updated_at   = now()
   where a.id = v_assignment_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists training_completion_recalc on public.training_item_completions;
create trigger training_completion_recalc
  after insert or delete on public.training_item_completions
  for each row execute function public.training_recalc_assignment();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.training_courses          enable row level security;
alter table public.training_course_items     enable row level security;
alter table public.training_assignments      enable row level security;
alter table public.training_item_completions enable row level security;
alter table public.training_certifications   enable row level security;

-- Courses + items: company members read, admins write.
drop policy if exists "training_courses_select" on public.training_courses;
create policy "training_courses_select" on public.training_courses
  for select using (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

drop policy if exists "training_courses_write" on public.training_courses;
create policy "training_courses_write" on public.training_courses
  for all
  using    (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'))
  with check (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'));

drop policy if exists "training_course_items_select" on public.training_course_items;
create policy "training_course_items_select" on public.training_course_items
  for select using (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

drop policy if exists "training_course_items_write" on public.training_course_items;
create policy "training_course_items_write" on public.training_course_items
  for all
  using    (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'))
  with check (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'));

-- Assignments: company members read (dashboards + own list); admins write.
-- Learners never write this table — the recalc trigger does.
drop policy if exists "training_assignments_select" on public.training_assignments;
create policy "training_assignments_select" on public.training_assignments
  for select using (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

drop policy if exists "training_assignments_write" on public.training_assignments;
create policy "training_assignments_write" on public.training_assignments
  for all
  using    (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'))
  with check (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'));

-- Completions: company members read; a user can only complete/uncomplete
-- items on their OWN assignment. Admins may delete (reopen flows).
drop policy if exists "training_completions_select" on public.training_item_completions;
create policy "training_completions_select" on public.training_item_completions
  for select using (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

drop policy if exists "training_completions_insert" on public.training_item_completions;
create policy "training_completions_insert" on public.training_item_completions
  for insert with check (
    user_id = auth.uid()
    and company_id = public.current_user_company()
    and exists (
      select 1 from public.training_assignments a
       where a.id = assignment_id
         and a.user_id = auth.uid()
         and a.company_id = public.current_user_company()
    )
  );

drop policy if exists "training_completions_delete" on public.training_item_completions;
create policy "training_completions_delete" on public.training_item_completions
  for delete using (
    public.current_user_role() = 'super_admin'
    or (user_id = auth.uid() and company_id = public.current_user_company())
    or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin')
  );

-- Certifications: employees see their own; admins see and manage all.
drop policy if exists "training_certs_select" on public.training_certifications;
create policy "training_certs_select" on public.training_certifications
  for select using (
    public.current_user_role() = 'super_admin'
    or (company_id = public.current_user_company()
        and (user_id = auth.uid() or public.current_user_role() = 'company_admin'))
  );

drop policy if exists "training_certs_write" on public.training_certifications;
create policy "training_certs_write" on public.training_certifications
  for all
  using    (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'))
  with check (public.current_user_role() = 'super_admin'
            or (company_id = public.current_user_company() and public.current_user_role() = 'company_admin'));

-- ── Viewer write-block (0049 convention) ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'training_courses','training_course_items','training_assignments',
    'training_item_completions','training_certifications'
  ] loop
    execute format('drop trigger if exists viewer_write_block on public.%I', t);
    execute format(
      'create trigger viewer_write_block before insert or update or delete on public.%I '
      || 'for each row execute function public.block_viewer_writes()', t);
  end loop;
end $$;
