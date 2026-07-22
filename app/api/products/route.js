import { getServiceClient, getCaller, canManageCatalog } from '@/lib/supabase/server';
import { BASE_PRODUCTS, CORE_SKUS } from '@/lib/catalog';

const baseSkus = new Set(BASE_PRODUCTS.map((p) => p.sku));
const json = (body, status = 200) => Response.json(body, { status });

// Builder-attribute columns (0061) — written only when the caller sent them,
// same preserve-guard idea as vendor/product_line below.
const BUILDER_ATTRS = [
  'mount_type', 'quality_tier', 'port_count', 'poe_watts', 'poe_budget_watts',
  'license_sku_1yr', 'license_sku_3yr', 'license_sku_5yr',
];
const pickBuilderAttrs = (body) =>
  Object.fromEntries(BUILDER_ATTRS.filter((k) => k in body).map((k) => [k, body[k]]));

// Catalog writes are scoped to the caller's team — except for the SUPER
// ADMIN, who may pass target_company_id in the body to fix any team's
// catalog (wrong products, bad prices). Other roles' targets are ignored.
async function requireManager(request, body = null) {
  const caller = await getCaller(request);
  if (!caller) return { error: json({ error: 'Unauthorized' }, 401) };
  if (!canManageCatalog(caller.role)) {
    return { error: json({ error: 'Forbidden — catalog edits require an Admin' }, 403) };
  }
  const isSuper = caller.role === 'super_admin';
  const companyId = (isSuper && body?.target_company_id) ? body.target_company_id : caller.company_id;
  if (!companyId) {
    return { error: json({ error: 'No team context — catalog edits must be made within a team' }, 400) };
  }
  return { caller, isSuper, svc: getServiceClient(), companyId };
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
  const body = await request.json();
  const { error, svc, companyId } = await requireManager(request, body);
  if (error) return error;
  const { sku, description, category, cost, price, vendor = '', preferred_vendor = '', product_line = '', technology = '', discount_pct = null } = body;
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
      { company_id: companyId, sku, description, category, technology, cost, price, vendor, preferred_vendor, product_line, discount_pct, ...pickBuilderAttrs(body), is_custom: !isBase, is_deleted: false },
      { onConflict: 'company_id,sku' }
    )
    .select()
    .single();
  if (dbErr) return json({ error: dbErr.message }, 400);
  return json({ product: data });
}

export async function PATCH(request) {
  const body = await request.json();
  const { error, svc, companyId, isSuper } = await requireManager(request, body);
  if (error) return error;
  const { sku, description, category, cost, price } = body;
  if (!sku) return json({ error: 'Missing sku' }, 400);

  // ── SKU rename (super admin only, custom products only) ─────────────────
  // Base-catalog SKUs are code constants the engines reference — they can't
  // be renamed. The rename updates the team's existing row in place so all
  // other data survives; proposal references are migrated by the client
  // (SkuRenameProposalsModal) after this succeeds.
  if (body.rename_from && body.rename_from !== sku) {
    if (!isSuper) return json({ error: 'Only the super admin can change a SKU' }, 403);

    // Base/core products: the engines reference these SKUs literally, so
    // the row keeps its identity and the new number becomes a per-team
    // DISPLAY alias (0065). Existing proposals keep working untouched.
    if (baseSkus.has(body.rename_from)) {
      if (baseSkus.has(sku)) {
        return json({ error: `${sku} collides with another base-catalog SKU` }, 409);
      }
      const { data: aliased, error: alErr } = await svc
        .from('custom_products')
        .upsert(
          {
            company_id: companyId,
            sku: body.rename_from,
            display_sku: sku,
            description, category, cost, price,
            ...('vendor' in body ? { vendor: body.vendor } : {}),
            ...('preferred_vendor' in body ? { preferred_vendor: body.preferred_vendor } : {}),
            ...('discount_pct' in body ? { discount_pct: body.discount_pct } : {}),
            ...pickBuilderAttrs(body),
            ...('product_line' in body ? { product_line: body.product_line } : {}),
            ...('technology' in body ? { technology: body.technology } : {}),
            is_custom: false,
            is_deleted: false,
          },
          { onConflict: 'company_id,sku' }
        )
        .select()
        .single();
      if (alErr) return json({ error: alErr.message }, 400);
      return json({ product: aliased, aliased: true });
    }

    if (baseSkus.has(sku)) {
      return json({ error: `${sku} collides with a base-catalog SKU` }, 409);
    }
    const { data: clash } = await svc
      .from('custom_products')
      .select('id, is_deleted')
      .eq('company_id', companyId)
      .eq('sku', sku)
      .maybeSingle();
    if (clash && !clash.is_deleted) return json({ error: `SKU ${sku} already exists` }, 409);
    if (clash) {
      // A soft-deleted override under the new name would collide on the
      // unique index — clear it; the renamed row supersedes it.
      await svc.from('custom_products').delete().eq('id', clash.id);
    }
    const { data: renamed, error: rnErr } = await svc
      .from('custom_products')
      .update({
        sku, description, category, cost, price,
        ...('vendor' in body ? { vendor: body.vendor } : {}),
        ...('preferred_vendor' in body ? { preferred_vendor: body.preferred_vendor } : {}),
        ...('discount_pct' in body ? { discount_pct: body.discount_pct } : {}),
        ...pickBuilderAttrs(body),
        ...('product_line' in body ? { product_line: body.product_line } : {}),
        ...('technology' in body ? { technology: body.technology } : {}),
      })
      .eq('company_id', companyId)
      .eq('sku', body.rename_from)
      .select()
      .single();
    if (rnErr) return json({ error: rnErr.message }, 400);
    if (!renamed) return json({ error: `${body.rename_from} is not in this team's catalog` }, 404);
    return json({ product: renamed, renamed_from: body.rename_from });
  }

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
        // Vendor + Source/Distributor get the same preserve-guard as
        // product_line/technology — a re-import without those columns must
        // never blank the catalog's vendor data (they now drive the
        // Builder's per-vendor tabs).
        ...('vendor' in body ? { vendor: body.vendor } : {}),
        ...('preferred_vendor' in body ? { preferred_vendor: body.preferred_vendor } : {}),
        ...('discount_pct' in body ? { discount_pct: body.discount_pct } : {}),
        ...pickBuilderAttrs(body),
        ...('product_line' in body ? { product_line: body.product_line } : {}),
        // Same preserve-guard as product_line: only touch technology when the
        // caller sent it, so legacy CSV re-imports never blank it.
        ...('technology' in body ? { technology: body.technology } : {}),
        // Explicit alias clear (super admin restoring a base SKU); imports
        // never send this, so existing aliases survive re-imports.
        ...('display_sku' in body && isSuper ? { display_sku: body.display_sku } : {}),
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
  const body = await request.json();
  const { error, svc, companyId, isSuper } = await requireManager(request, body);
  if (error) return error;
  const { sku } = body;
  if (!sku) return json({ error: 'Missing sku' }, 400);

  // Core SKUs the engine depends on can't be deleted by team admins. The
  // super admin may — that's the platform owner deliberately removing a
  // wrong product, accepting that Builder lines referencing it disappear.
  if (CORE_SKUS.has(sku) && !isSuper) {
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
    // Hard-delete a pure custom product (this team's row only). Deleting a
    // sku that doesn't exist in the caller's team is an error, not a silent
    // success — it would mean the UI showed a row from some other catalog.
    const { data: deleted, error: dbErr } = await svc
      .from('custom_products')
      .delete()
      .eq('company_id', companyId)
      .eq('sku', sku)
      .select('id');
    if (dbErr) return json({ error: dbErr.message }, 400);
    if (!deleted || deleted.length === 0) {
      return json({ error: `${sku} is not in your team's catalog` }, 404);
    }
  }
  return json({ ok: true });
}
