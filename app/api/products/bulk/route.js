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
  if (!caller.company_id) {
    return json({ error: 'No team context — catalog edits must be made within a team' }, 400);
  }

  const body = await request.json();
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows) return json({ error: 'Missing rows array' }, 400);
  if (rows.length === 0) return json({ updated: 0, errors: [] });
  if (rows.length > MAX_ROWS) return json({ error: `Too many rows (max ${MAX_ROWS})` }, 400);

  const companyId = caller.company_id;
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
      product_line: r.product_line ?? '',
      is_custom: !baseSkus.has(r.sku),
      is_deleted: false,
    });
  }

  if (upsertRows.length === 0) return json({ updated: 0, errors });

  const svc = getServiceClient();
  const { error: dbErr } = await svc
    .from('custom_products')
    .upsert(upsertRows, { onConflict: 'company_id,sku' });
  if (dbErr) return json({ error: dbErr.message }, 400);

  return json({ updated: upsertRows.length, errors });
}
