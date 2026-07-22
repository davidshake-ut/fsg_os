import { getServiceClient, getCaller, canManageCatalog } from '@/lib/supabase/server';
import { BASE_PRODUCTS } from '@/lib/catalog';

const baseSkus = new Set(BASE_PRODUCTS.map((p) => p.sku));
const json = (body, status = 200) => Response.json(body, { status });
const MAX_ROWS = 2000;

// Bulk upsert for two callers: (1) a discount-% change recomputing cost for
// every product in a product_line, (2) a vendor price-list import updating
// price/cost/product_line for matched SKUs. Both always supply full rows
// (sourced from the already-loaded catalog), so this mirrors the single-row
// PATCH validation rather than supporting partial patches.
export async function PATCH(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  if (!canManageCatalog(caller.role)) {
    return json({ error: 'Forbidden — catalog edits require an Admin' }, 403);
  }

  const body = await request.json();
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows) return json({ error: 'Missing rows array' }, 400);
  if (rows.length === 0) return json({ updated: 0, errors: [] });
  if (rows.length > MAX_ROWS) return json({ error: `Too many rows (max ${MAX_ROWS})` }, 400);

  // Same super-admin target override as the single-row routes: the platform
  // owner may bulk-edit any team's catalog; everyone else writes their own.
  const isSuper = caller.role === 'super_admin';
  const companyId = (isSuper && body.target_company_id) ? body.target_company_id : caller.company_id;
  if (!companyId) {
    return json({ error: 'No team context — catalog edits must be made within a team' }, 400);
  }
  const errors = [];
  const upsertRows = [];
  for (const r of rows) {
    if (!r?.sku || !r?.description || !r?.category) {
      errors.push(`Skipped row with sku "${r?.sku ?? '?'}" — missing description or category.`);
      continue;
    }
    upsertRows.push({
      company_id: companyId,
      sku: r.sku,
      description: r.description,
      category: r.category,
      technology: r.technology ?? '',
      cost: Number(r.cost) || 0,
      price: Number(r.price) || 0,
      ...(r.vendor !== undefined ? { vendor: r.vendor } : {}),
      ...(r.preferred_vendor !== undefined ? { preferred_vendor: r.preferred_vendor } : {}),
      // Same preserve-guard: only touch the stored discount % when the
      // import mapped a Discount column for this row.
      ...(r.discount_pct !== undefined && Number.isFinite(Number(r.discount_pct))
        ? { discount_pct: Number(r.discount_pct) }
        : {}),
      // Builder attributes (0061): written only when the caller sent them
      // (bulk edit's Mount/Quality), never blanked by other bulk callers.
      ...(r.mount_type !== undefined ? { mount_type: r.mount_type } : {}),
      ...(r.quality_tier !== undefined ? { quality_tier: r.quality_tier } : {}),
      ...(r.port_count !== undefined ? { port_count: r.port_count } : {}),
      ...(r.poe_watts !== undefined ? { poe_watts: r.poe_watts } : {}),
      ...(r.poe_budget_watts !== undefined ? { poe_budget_watts: r.poe_budget_watts } : {}),
      ...(r.license_sku_1yr !== undefined ? { license_sku_1yr: r.license_sku_1yr } : {}),
      ...(r.license_sku_3yr !== undefined ? { license_sku_3yr: r.license_sku_3yr } : {}),
      ...(r.license_sku_5yr !== undefined ? { license_sku_5yr: r.license_sku_5yr } : {}),
      product_line: r.product_line ?? '',
      is_custom: !baseSkus.has(r.sku),
      is_deleted: false,
    });
  }

  if (upsertRows.length === 0) return json({ updated: 0, errors });

  // Postgres rejects an upsert that touches the same (company_id, sku) row
  // twice ("ON CONFLICT DO UPDATE command cannot affect row a second time"),
  // so dedupe defensively for every caller — last occurrence wins.
  const deduped = [...new Map(upsertRows.map((r) => [r.sku, r])).values()];

  const svc = getServiceClient();
  const { error: dbErr } = await svc
    .from('custom_products')
    .upsert(deduped, { onConflict: 'company_id,sku' });
  if (dbErr) return json({ error: dbErr.message }, 400);

  return json({ updated: deduped.length, errors });
}
