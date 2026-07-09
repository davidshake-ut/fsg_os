-- Cost/bill rates on time entries so project budget tracking can compute a
-- real "Budget Consumed" figure instead of the placeholder "rates coming
-- soon" dash. Rates are captured per-entry (not derived from a user/role
-- table, since none exists yet) — the TimeLog form remembers the last-used
-- values so this doesn't mean re-typing a rate every time.

alter table public.psa_time_entries
  add column if not exists billable  boolean not null default true,
  add column if not exists cost_rate numeric(10,2),
  add column if not exists bill_rate numeric(10,2);
