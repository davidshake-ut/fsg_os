-- Register 'messages' as a proper toggleable module (Message Center is a
-- standalone capability, not a sub-feature of Projects — unlike
-- templates/automations, which piggyback on the 'projects' module in
-- components/Sidebar.jsx's nav-gating rather than getting their own key).
--
-- Also adds the already-missing 'invoices' key while touching this
-- constraint — ALL_MODULE_KEYS (hooks/useModules.js) has included it since
-- invoices shipped, but the DB check constraint was never updated, latent
-- drift that happened to be harmless only because ModulesPanel.jsx never
-- exposed an invoices toggle to actually write that key.
alter table public.company_modules drop constraint if exists company_modules_module_key_check;
alter table public.company_modules add constraint company_modules_module_key_check
  check (module_key in ('dashboard','crm','builder','projects','support','resources','invoices','messages'));
