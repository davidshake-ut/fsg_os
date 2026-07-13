-- CRM contacts grow up + support tickets get a category.
--
-- 1. Contacts gain role/mobile so the 360° page can hold real contact info,
--    and a contact<->property join table ties one person to many properties
--    (a property manager overseeing several buildings, a regional IT
--    director across sites). Properties already fan out to proposals and a
--    project, so the contact inherits that whole chain by association.
-- 2. Tickets gain a category ("what kind of problem is this?") alongside
--    priority — hardware failure vs network issue vs feature request routes
--    very differently even at the same priority.

-- ── Contact detail fields ─────────────────────────────────────────────────
alter table public.crm_contacts
  add column if not exists role   text,
  add column if not exists mobile text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_contacts_role_check'
  ) then
    alter table public.crm_contacts add constraint crm_contacts_role_check
      check (role in ('primary','billing','onsite','property_manager','technical','other'));
  end if;
end $$;

-- ── Contact <-> Property (many-to-many) ───────────────────────────────────
create table if not exists public.crm_contact_properties (
  contact_id  uuid        not null references public.crm_contacts(id) on delete cascade,
  property_id uuid        not null references public.properties(id) on delete cascade,
  company_id  uuid        not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (contact_id, property_id)
);

create index if not exists crm_contact_properties_property_idx on public.crm_contact_properties(property_id);
create index if not exists crm_contact_properties_company_idx  on public.crm_contact_properties(company_id);

alter table public.crm_contact_properties enable row level security;

drop policy if exists "crm_contact_properties_access" on public.crm_contact_properties;
create policy "crm_contact_properties_access" on public.crm_contact_properties
  for all
  using    (company_id = public.current_user_company() or public.current_user_role() = 'super_admin')
  with check (company_id = public.current_user_company() or public.current_user_role() = 'super_admin');

-- ── Ticket category ───────────────────────────────────────────────────────
alter table public.support_tickets
  add column if not exists category text not null default 'other';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_tickets_category_check'
  ) then
    alter table public.support_tickets add constraint support_tickets_category_check
      check (category in ('hardware','network','software_bug','configuration','feature_request','training','billing','maintenance','other'));
  end if;
end $$;
