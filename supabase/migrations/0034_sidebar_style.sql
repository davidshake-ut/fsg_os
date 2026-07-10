-- Lets a team choose whether the "bold" appearance's sidebar renders as a
-- Primary->Secondary gradient (default) or a flat Primary fill. Meaningless
-- in "muted" mode, which always keeps a flat white sidebar — see
-- components/AdminPanel.jsx's BrandingForm and app/globals.css.

alter table public.companies add column if not exists sidebar_style text not null default 'gradient' check (sidebar_style in ('gradient', 'solid'));
