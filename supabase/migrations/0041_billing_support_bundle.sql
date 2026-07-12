-- Lifecycle flow, Tier 2: carry the payload downstream.
--
-- bom_snapshot: the as-sold line items (system, sku, description, category,
-- qty, unitPrice, totalPrice), written by the Builder when a proposal is
-- marked Sent and refreshed at Accepted — same moment-of-truth pattern as
-- catalog_snapshot (0022). Until now the parts list existed only as a
-- client-side recomputation (lib/calculateBOM.js), so nothing downstream
-- (support's "what was installed", asset generation) could read it from
-- the database.
--
-- milestone_ids: which project milestones an invoice bills — enables
-- phase/progress billing for long builds. uuid[] rather than a join table:
-- read patterns are "which milestones has this project already billed"
-- (union of arrays across its invoices) at demo-team scale.

alter table public.saved_projects add column if not exists bom_snapshot jsonb;
alter table public.invoices add column if not exists milestone_ids uuid[] not null default '{}';
