import { getServiceClient, getCaller, canManageCatalog } from '@/lib/supabase/server';
import { BASE_PRODUCTS, CORE_SKUS } from '@/lib/catalog';

const baseSkus = new Set(BASE_PRODUCTS.map((p) => p.sku));
const json = (body, status = 200) => Response.json(body, { status });

// Catalog writes are scoped to the caller's team. A caller with no team context
// (e.g. a super admin not attached to a company) cannot create orphaned rows.
async function requireManager(request) {
  const caller = await getCaller(request);
  if (!caller) return { error: json({ error: 'Unauthorized' }, 401) };
  if (!canManageCatalog(caller.role)) {
    return { error: json({ error: 'Forbidden — catalog edits require an Admin' }, 403) };
  }
  if (!caller.company_id) {
    return { error: json({ error: 'No team context — catalog edits must be made within a team' }, 400) };
  }
  return { caller, svc: getServiceClient(), companyId: caller.company_id };
}

export async function GET(request) {
  const caller = await getCaller(request);
  if (!caller) return json({ error: 'Unauthorized' }, 401);
  const svc = getServiceClient();
  let query = svc.from('custom_products').select('*');
  if (caller.company_id) query = query.eq('company_id', caller.company_id);
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ products: data });
}

export async function POST(request) {
  const { error, svc, companyId } = await requireManager(request);
  if (error) return error;
  const body = await request.json();
  const { sku, description, category, cost, price, vendor = '', preferred_vendor = '', product_line = '' } = body;
  if (!sku || !description || !category) return json({ error: 'Missing fields' }, 400);

  // Reject only SKUs that are currently live for this team. A base product is
  // live unless an override row hides it; a custom SKU is live while it has an
  // active row. A previously-deleted product (soft-deleted override) can be
  // re-added — upsert revives that row instead of hitting the unique index and
  // erroring (matches local mode).
  const isBase = baseSkus.has(sku);
  const { data: existing } = await svc
    .from('custom_products')
    .select('id, is_deleted')
    .eq('company_id', companyId)
    .eq('sku', sku)
    .maybeSingle();
  if ((isBase && !existing) || (existing && !existing.is_deleted)) {
    return json({ error: `SKU ${sku} already exists` }, 409);
  }

  const { data, error: dbErr } = await svc
    .from('custom_products')
    .upsert(
      { company_id: companyId, sku, description, category, cost, price, vendor, preferred_vendor, product_line, is_custom: !isBase, is_deleted: false },
      { onConflict: 'company_id,sku' }
    )
    .select()
    .single();
  if (dbErr) return json({ error: dbErr.message }, 400);
  return json({ product: data });
}

export async function PATCH(request) {
  const { error, svc, companyId } = await requireManager(request);
  if (error) return error;
  const body = await request.json();
  const { sku, description, category, cost, price, vendor = '', preferred_vendor = '' } = body;
  if (!sku) return json({ error: 'Missing sku' }, 400);

  // Upsert per (company_id, sku): editing a base product writes/updates an
  // override row for this team only. product_line is included only when the
  // caller explicitly sent it — Postgres leaves omitted columns untouched on
  // conflict, so a general catalog re-import (no product_line column) never
  // blanks out a product_line assigned via the vendor price importer.
  const isBase = baseSkus.has(sku);
  const { data, error: dbErr } = await svc
    .from('custom_products')
    .upsert(
      {
        company_id: companyId,
        sku,
        description,
        category,
        cost,
        price,
        vendor,
        preferred_vendor,
        ...('product_line' in body ? { product_line: body.product_line } : {}),
        is_custom: !isBase,
        is_deleted: false,
      },
      { onConflict: 'company_id,sku' }
    )
    .select()
    .single();
  if (dbErr) return json({ error: dbErr.message }, 400);
  return json({ product: data });
}

export async function DELETE(request) {
  const { error, svc, companyId } = await requireManager(request);
  if (error) return error;
  const { sku } = await request.json();
  if (!sku) return json({ error: 'Missing sku' }, 400);

  // Core SKUs the engine depends on can never be deleted.
  if (CORE_SKUS.has(sku)) {
    return json({ error: `${sku} is a core product and cannot be deleted` }, 400);
  }

  if (baseSkus.has(sku)) {
    // Soft-delete a (non-core) base product via a per-team override row.
    const { error: dbErr } = await svc
      .from('custom_products')
      .upsert(
        { company_id: companyId, sku, description: sku, category: 'Miscellaneous', cost: 0, price: 0, is_deleted: true },
        { onConflict: 'company_id,sku' }
      );
    if (dbErr) return json({ error: dbErr.message }, 400);
  } else {
    // Hard-delete a pure custom product (this team's row only).
    const { error: dbErr } = await svc
      .from('custom_products')
      .delete()
      .eq('company_id', companyId)
      .eq('sku', sku);
    if (dbErr) return json({ error: dbErr.message }, 400);
  }
  return json({ ok: true });
}
