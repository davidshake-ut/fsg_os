-- 0061: catalog attributes that drive the Managed Wi-Fi builder's
-- tag-based equipment selection (per David, 2026-07-21):
--   mount_type       'ceiling' | 'wall' — which deployment an AP serves
--   quality_tier     'better' | 'best' — the builder's Quality selector
--   port_count       switches: data/PoE port count (24- vs 48-class sizing)
--   poe_watts        APs: PoE draw in watts (power-budget packing)
--   poe_budget_watts switches: total PoE budget in watts
--   license_sku_*    linked support/license SKU per term; the builder's
--                    License Term selector (1/3/5 yr) picks which one
-- All nullable: untagged catalogs keep the legacy Cambium engine behavior.

alter table public.custom_products add column if not exists mount_type text;
alter table public.custom_products add column if not exists quality_tier text;
alter table public.custom_products add column if not exists port_count integer;
alter table public.custom_products add column if not exists poe_watts numeric(6,2);
alter table public.custom_products add column if not exists poe_budget_watts numeric(7,2);
alter table public.custom_products add column if not exists license_sku_1yr text;
alter table public.custom_products add column if not exists license_sku_3yr text;
alter table public.custom_products add column if not exists license_sku_5yr text;
