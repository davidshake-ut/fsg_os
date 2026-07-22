-- Per-team display alias for base-catalog SKUs (super-admin "edit core SKU").
--
-- Base/core product SKUs are code constants the BOM engines reference
-- literally, so they can't be truly renamed per team. Instead an override
-- row keeps its identity in `sku` (the base SKU) and carries the team's
-- corrected number in `display_sku` — the catalog, BOM lines, snapshots,
-- and exports show the display value while every engine lookup, price
-- override, and existing proposal keeps working against the identity.
-- Custom products don't use this: their `sku` column is renamed directly.

alter table public.custom_products
  add column if not exists display_sku text;
