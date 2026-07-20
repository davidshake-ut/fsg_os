-- Split invoice tax into independently toggleable state + local components,
-- each with its own editable rate. The legacy combined tax_rate/tax_amount
-- columns remain and keep being written (combined values) so every existing
-- display path stays correct.

alter table public.invoices
  add column if not exists state_tax_enabled boolean       not null default false,
  add column if not exists local_tax_enabled boolean       not null default false,
  add column if not exists state_tax_rate    numeric(5,2)  not null default 0,
  add column if not exists local_tax_rate    numeric(5,2)  not null default 0;

-- Legacy invoices with a combined rate: carry it as state tax so editing
-- them round-trips cleanly.
update public.invoices
   set state_tax_enabled = true,
       state_tax_rate    = tax_rate
 where tax_rate > 0
   and state_tax_enabled = false
   and local_tax_enabled = false
   and state_tax_rate = 0;
