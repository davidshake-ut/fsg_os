-- Link an invoice to the specific change order it's billing, so approved
-- work can be tracked through to being invoiced (closes the "approved CO
-- sits unbilled forever" revenue-leakage gap).

alter table public.invoices
  add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;

create index if not exists invoices_change_order_idx on public.invoices(change_order_id);
