-- 0063: Custom Modules Phase D — per-variant custom fields.
-- A module variant defines field DEFINITIONS in its config (key/label/type/
-- options); records store VALUES in one jsonb map per row, so no schema
-- change is ever needed when David adds a field to a variant. Records of
-- teams on the stock module simply keep an empty map.

alter table public.crm_accounts    add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.psa_projects    add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.support_tickets add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.invoices        add column if not exists custom_fields jsonb not null default '{}'::jsonb;
