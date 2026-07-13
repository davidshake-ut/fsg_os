-- Universal Builder, Tier 1: products gain a technology dimension.
-- "Category" in the UI now means the technology a part belongs to
-- (lib/technologies.js ids); the old part-type values (Access Point,
-- Switch, Camera, ...) live on as "Subcategory" (the existing category
-- column, unchanged — calculators, segments, and asset generation keep
-- reading it).
alter table public.custom_products
  add column if not exists technology text not null default '';

-- Backfill existing catalog rows from their part type: camera-world parts
-- go to Video Surveillance, everything else in the legacy catalog is
-- Managed Wi-Fi. Only rows the backfill hasn't touched (idempotent).
update public.custom_products
set technology = case
  when category in ('Camera', 'NVR', 'Storage', 'License') then 'video_surveillance'
  else 'managed_wifi'
end
where technology = '';
