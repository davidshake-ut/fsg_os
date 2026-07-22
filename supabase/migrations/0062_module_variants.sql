-- 0062: Custom Modules, Phase A (module variants).
-- A "custom module" is a named CONFIG OVERLAY on a base module — one
-- codebase, per-team presentation/workflow config. Stock defaults live in
-- lib/moduleConfig.js; a variant's config jsonb is a deep-partial override
-- (empty config = a faithful clone of the stock module).
--
-- Creating/editing variants is SUPER ADMIN ONLY (David's explicit call).
-- Assignment rides company_modules.variant_id — and company_modules writes
-- are already super-admin-only since 0049 dropped the company-admin policy,
-- so assignment inherits the same lockdown with no extra policy.

create table if not exists public.module_variants (
  id          uuid        primary key default gen_random_uuid(),
  base_module text        not null check (base_module in ('dashboard','crm','builder','projects','support','resources','invoices','messages')),
  name        text        not null,
  description text,
  config      jsonb       not null default '{}'::jsonb,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.module_variants enable row level security;

-- Every signed-in user must be able to READ variant configs — that's how a
-- member session resolves what their team's modules look like.
create policy "module_variants_read" on public.module_variants
  for select to authenticated
  using (true);

create policy "module_variants_super_admin_write" on public.module_variants
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- Which variant a team runs for a module. Null / missing row = stock module.
alter table public.company_modules
  add column if not exists variant_id uuid references public.module_variants(id) on delete set null;
