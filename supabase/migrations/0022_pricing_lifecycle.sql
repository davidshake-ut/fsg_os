-- Product Line + discount-driven cost, and catalog snapshot freezing for
-- locked quotes. Sent/accepted/declined quotes must not reprice when the
-- catalog changes later — only new drafts/revisions see updated pricing.

alter table public.custom_products
  add column if not exists product_line text not null default '';

alter table public.saved_projects
  add column if not exists catalog_snapshot jsonb not null default '{}';
