-- 0060: per-product vendor discount percentage.
-- Populated by the vendor price-list importer when a Discount column is
-- mapped (David: store it on the product as well as using it to compute
-- Cost), and editable on the product form. Null = no stored discount; the
-- Product Line discount system remains the fallback for cost math.

alter table public.custom_products add column if not exists discount_pct numeric(6,3);
