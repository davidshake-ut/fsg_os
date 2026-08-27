-- 0067: assemblies (kits) — complex-project Builder, Phase 3.
-- A catalog product with `components` is a kit: its cost and price roll up
-- live from the component SKUs × quantities (lib/assemblies.js) and it
-- quotes as ONE line (telecom-room rack kits, in-unit media panels, PON
-- bundles…). A component may pin its own unit cost / price for the kit.
-- null = a plain product. Base-catalog kits live in code (lib/catalog.js);
-- this column lets a team create or edit its own.
--
--   components jsonb: [{ "sku": text, "qty": number, "unitCost"?: number, "unitPrice"?: number, "note"?: text }]

alter table public.custom_products add column if not exists components jsonb;

comment on column public.custom_products.components is
  'Assembly (kit) components: [{sku, qty, unitCost?, unitPrice?, note?}] — null for a plain product. Cost/price roll up live in the app (lib/assemblies.js).';
