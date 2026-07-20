-- Second logo variant: light (white/knockout) artwork for dark backgrounds.
-- The existing `logo` column stays the standard dark-artwork version used on
-- light backgrounds; consumers pick a variant with lib/colors.js pickLogo()
-- based on the luminance of whatever they're drawing it onto.

alter table public.companies
  add column if not exists logo_light jsonb;
