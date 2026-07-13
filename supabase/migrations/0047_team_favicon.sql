-- Per-team favicon, set from Team Branding. Stored like the logo: a small
-- { dataUrl } jsonb, applied to <link rel="icon"> by BrandingVars.
alter table public.companies
  add column if not exists favicon jsonb;
