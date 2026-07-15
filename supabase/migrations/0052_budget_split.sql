-- 0052: project budget split — Equipment (feeds future purchase orders)
-- vs Labor (feeds future time-log tracking). `budget` remains the
-- authoritative total everywhere it is read today; the two new columns are
-- the optional breakdown, prefilled from the source quote when a project
-- is created from a proposal (equipment = the quote's primary hardware
-- total, labor = the professional-labor section).

alter table public.psa_projects add column if not exists equipment_budget numeric(12,2);
alter table public.psa_projects add column if not exists labor_budget numeric(12,2);
