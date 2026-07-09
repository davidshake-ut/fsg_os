-- Lightweight sales pipeline on crm_accounts — stage/value/probability/close
-- date directly on the account rather than a separate opportunities table.
-- This CRM has one deal per account at a time in practice (no multi-deal
-- history need identified yet); a dedicated opportunities table can be split
-- out later if that changes.

alter table public.crm_accounts
  add column if not exists stage               text not null default 'new',
  add column if not exists deal_value           numeric(12,2),
  add column if not exists probability          int,
  add column if not exists expected_close_date  date;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_accounts_stage_check'
  ) then
    alter table public.crm_accounts add constraint crm_accounts_stage_check
      check (stage in ('new','qualifying','proposal','negotiation','won','lost'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'crm_accounts_probability_check'
  ) then
    alter table public.crm_accounts add constraint crm_accounts_probability_check
      check (probability is null or probability between 0 and 100);
  end if;
end $$;
