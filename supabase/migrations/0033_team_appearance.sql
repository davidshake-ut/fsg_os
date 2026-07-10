-- Team appearance settings: a second brand color (feeds the sidebar/button
-- gradient alongside the existing primary_color, migration 0004) and a
-- "muted" vs "bold" visual-density mode. Both are set from Team Branding
-- (components/AdminPanel.jsx) and applied app-wide via components/BrandingVars.jsx.

alter table public.companies add column if not exists secondary_color text default '#0891b2';
alter table public.companies add column if not exists ui_theme text not null default 'bold' check (ui_theme in ('muted', 'bold'));
