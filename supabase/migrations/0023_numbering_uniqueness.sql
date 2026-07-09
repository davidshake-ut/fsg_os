-- invoice_number and co_number are computed client/server-side as
-- select-max-then-increment, which races under concurrent creates. A unique
-- index turns a lost race into a 23505 the caller can retry on, instead of
-- two rows silently sharing the same number.

create unique index if not exists invoices_company_number_uidx
  on public.invoices(company_id, invoice_number);

create unique index if not exists change_orders_project_number_uidx
  on public.change_orders(project_id, co_number);
