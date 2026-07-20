-- Training module demo seed — DEVELOPMENT / STAGING ONLY. Never run this in
-- production; it inserts demo rows into whichever company it targets.
--
-- Usage: paste into the Supabase SQL editor of a dev/staging project AFTER
-- applying migration 0058. By default it targets the oldest company and
-- spreads assignments/certifications across that company's existing
-- non-viewer users. To target a specific team, replace the v_company
-- assignment with its uuid.
--
-- Everything it creates is prefixed "Demo:" so it's easy to find and delete.

do $$
declare
  v_company uuid := (select id from public.companies order by created_at limit 1);
  v_admin   uuid;
  v_users   uuid[];
  v_n       int;
  v_course1 uuid;
  v_course2 uuid;
  v_item    uuid;
  v_assign  uuid;
  v_res_checklist uuid;
  v_res_standards uuid;
begin
  if v_company is null then
    raise exception 'No companies exist — create a team first.';
  end if;

  select id into v_admin from public.users
   where company_id = v_company and role in ('company_admin','super_admin')
   order by created_at limit 1;

  select array_agg(id order by created_at) into v_users
    from public.users where company_id = v_company and role <> 'viewer';
  v_n := coalesce(array_length(v_users, 1), 0);
  if v_n = 0 then
    raise exception 'Target company has no non-viewer users.';
  end if;

  -- ── Demo resources the course items point at (reused, not duplicated) ──
  insert into public.resources (company_id, title, description, type, category, created_by)
  values (v_company, 'Demo: Jobsite Safety Checklist', 'Pre-work walkthrough checklist for every jobsite.', 'template', 'Safety', v_admin)
  returning id into v_res_checklist;

  insert into public.resources (company_id, title, description, type, category, created_by)
  values (v_company, 'Demo: Wi-Fi Installation Standards', 'Cabling, mounting, and labeling standards for managed Wi-Fi installs.', 'doc', 'Installation', v_admin)
  returning id into v_res_standards;

  -- ── Course 1: Jobsite Safety Orientation (published) ──────────────────
  insert into public.training_courses
    (company_id, title, description, status, category, estimated_minutes, created_by, published_at)
  values
    (v_company, 'Demo: Jobsite Safety Orientation',
     'Required safety orientation for everyone who sets foot on a jobsite.',
     'published', 'Safety', 45, v_admin, now())
  returning id into v_course1;

  insert into public.training_course_items (company_id, course_id, sort_order, title, item_type, resource_id) values
    (v_company, v_course1, 0, 'Review the jobsite safety checklist', 'resource', v_res_checklist);
  insert into public.training_course_items (company_id, course_id, sort_order, title, item_type, external_url) values
    (v_company, v_course1, 1, 'OSHA construction safety basics', 'external_url', 'https://www.osha.gov/construction'),
    (v_company, v_course1, 2, 'Ladder & lift safety video', 'external_url', 'https://www.youtube.com/results?search_query=ladder+safety+training');

  -- ── Course 2: Managed Wi-Fi Installation Fundamentals (published) ─────
  insert into public.training_courses
    (company_id, title, description, status, category, estimated_minutes, created_by, published_at)
  values
    (v_company, 'Demo: Managed Wi-Fi Installation Fundamentals',
     'Core install standards for managed Wi-Fi projects: cabling, AP placement, labeling, and closeout.',
     'published', 'Installation', 90, v_admin, now())
  returning id into v_course2;

  insert into public.training_course_items (company_id, course_id, sort_order, title, item_type, resource_id) values
    (v_company, v_course2, 0, 'Wi-Fi installation standards', 'resource', v_res_standards);
  insert into public.training_course_items (company_id, course_id, sort_order, title, item_type, external_url) values
    (v_company, v_course2, 1, 'Vendor certification portal', 'external_url', 'https://www.ui.com/training');

  -- ── Assignments in mixed states across existing users ─────────────────
  -- User 1: course 1 completed (trigger fires as completions insert).
  insert into public.training_assignments (company_id, course_id, user_id, assignment_source, assigned_by, due_date)
  values (v_company, v_course1, v_users[1], 'everyone', v_admin, current_date + 14)
  returning id into v_assign;
  for v_item in (select id from public.training_course_items where course_id = v_course1) loop
    insert into public.training_item_completions (company_id, assignment_id, course_item_id, user_id)
    values (v_company, v_assign, v_item, v_users[1]);
  end loop;

  -- User 1: course 2 in progress (1 of 2 items).
  insert into public.training_assignments (company_id, course_id, user_id, assignment_source, assigned_by, due_date)
  values (v_company, v_course2, v_users[1], 'individual', v_admin, current_date + 30)
  returning id into v_assign;
  select id into v_item from public.training_course_items where course_id = v_course2 order by sort_order limit 1;
  insert into public.training_item_completions (company_id, assignment_id, course_item_id, user_id)
  values (v_company, v_assign, v_item, v_users[1]);

  -- User 2 (or user 1 on tiny teams): course 1 OVERDUE not-started.
  insert into public.training_assignments (company_id, course_id, user_id, assignment_source, assigned_by, due_date)
  values (v_company, v_course1, v_users[least(2, v_n)], 'role', v_admin, current_date - 7)
  on conflict (course_id, user_id) do nothing;

  -- User 3: course 2 not started, due soon.
  if v_n >= 3 then
    insert into public.training_assignments (company_id, course_id, user_id, assignment_source, assigned_by, due_date)
    values (v_company, v_course2, v_users[3], 'everyone', v_admin, current_date + 7)
    on conflict (course_id, user_id) do nothing;
  end if;

  -- ── Certifications across every status ────────────────────────────────
  insert into public.training_certifications
    (company_id, user_id, name, issuing_org, cert_number, issue_date, expiry_date, created_by) values
    (v_company, v_users[1], 'Demo: OSHA 30-Hour Construction', 'OSHA', 'OSHA-30-4821', current_date - interval '1 year', current_date + interval '2 years', v_admin),   -- active
    (v_company, v_users[1], 'Demo: Low Voltage License', 'State Licensing Board', 'LV-2210', current_date - interval '3 years', null, v_admin),                          -- non-expiring
    (v_company, v_users[least(2, v_n)], 'Demo: Manufacturer Wi-Fi Certification', 'Ubiquiti', 'UWA-1042', current_date - interval '2 years', current_date + 75, v_admin), -- expiring ≤90
    (v_company, v_users[least(2, v_n)], 'Demo: First Aid / CPR', 'Red Cross', null, current_date - interval '2 years', current_date + 21, v_admin),                       -- expiring ≤30
    (v_company, v_users[least(3, v_n)], 'Demo: Aerial Lift Operator', 'IPAF', 'AL-8834', current_date - interval '4 years', current_date - 45, v_admin);                  -- expired

  raise notice 'Training demo seed complete for company %', v_company;
end $$;

-- To remove the demo data later:
--   delete from public.training_courses        where title like 'Demo:%';
--   delete from public.training_certifications where name  like 'Demo:%';
--   delete from public.resources               where title like 'Demo:%';
