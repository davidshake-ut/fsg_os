-- 0050: Tier 3 of the Universal Builder — the PSA/template world speaks the
-- technology registry's labels (lib/technologies.js) instead of the legacy
-- template names, and assets learn the new device types.
--
-- 1) Re-key stored technology labels on project technology rows and task
--    templates: 'Camera Systems' → 'Video Surveillance', 'Fiber' →
--    'Digital Infrastructure', 'Audio / Visual' → 'Audio/Video'. The code
--    drops LEGACY_TEMPLATE_TECH in the same commit, so Create Project
--    matches templates by registry label directly (idempotent: re-runs
--    match zero rows).
--
-- 2) Widen assets.asset_type for the new trackable device categories
--    (smart devices, door controllers, EV chargers) so accepted proposals
--    from the new technology pages can generate assets.

update public.project_technologies set technology = 'Video Surveillance'     where technology = 'Camera Systems';
update public.project_technologies set technology = 'Digital Infrastructure' where technology = 'Fiber';
update public.project_technologies set technology = 'Audio/Video'            where technology = 'Audio / Visual';

update public.project_templates set technology = 'Video Surveillance'     where technology = 'Camera Systems';
update public.project_templates set technology = 'Digital Infrastructure' where technology = 'Fiber';
update public.project_templates set technology = 'Audio/Video'            where technology = 'Audio / Visual';

alter table public.assets drop constraint if exists assets_asset_type_check;
alter table public.assets add constraint assets_asset_type_check
  check (asset_type in ('access_point','camera','switch','gateway','nvr','smart_device','door_controller','ev_charger','other'));
