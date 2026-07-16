-- 0054: per-team app background color (Team Branding → Brand Colors).
-- Applied app-wide as the --ui-page-bg CSS variable by BrandingVars; null
-- falls back to the stock soft-neutral page (#f6f7f9).

alter table public.companies add column if not exists background_color text;
