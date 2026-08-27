-- 0068: design options — complex-project Builder, Phase 6.
-- A property can be quoted several ways (Wi-Fi 6 baseline, extended coverage,
-- Wi-Fi 7, FTTU…). Each option is a full quote (its own inputs, lifecycle,
-- revisions, PDF) that shares an option_group_id with its siblings; the
-- comparison view and the customer options PDF lay a group side by side.
--
--   option_group_id  uuid   siblings on one property (revisions inherit it)
--   option_label     text   "Wi-Fi 6 baseline", "Extended coverage"…
--   option_notes     text   customer-facing note for this option
--   summary          jsonb  written by the Builder on every save:
--                           { units, aps, switches, idfs, techs, wifiGeneration,
--                             designSource, fiberToUnits, architecture, pricingMode,
--                             hardware: {cost, price}, labor: {cost, price},
--                             cabling: {cost, price}, total: {cost, price} }
--                           — what the comparison reads, so it never has to
--                           re-run every engine for every option.

alter table public.saved_projects
  add column if not exists option_group_id uuid,
  add column if not exists option_label    text,
  add column if not exists option_notes    text,
  add column if not exists summary         jsonb;

create index if not exists saved_projects_option_group_idx
  on public.saved_projects(option_group_id) where option_group_id is not null;

comment on column public.saved_projects.option_group_id is 'Design options: sibling quotes on one property share this id (revisions inherit it).';
comment on column public.saved_projects.summary is 'Per-save quote summary the options comparison reads (lib/optionComparison.js buildQuoteSummary).';
