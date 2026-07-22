-- 0064: separate Gradient/Solid choice for buttons & accent fills.
-- sidebar_style (0034) keeps governing the sidebar only; accent_style
-- governs everything reading --ui-button-bg (buttons, accent strips,
-- pipeline fills, stat tiles). Both are bold-mode sub-choices.

alter table public.companies
  add column if not exists accent_style text not null default 'gradient'
  check (accent_style in ('gradient','solid'));
