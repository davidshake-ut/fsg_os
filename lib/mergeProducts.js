import { BASE_PRODUCTS, CATEGORY_ORDER, CORE_SKUS } from './catalog';

// Merge the static BASE_PRODUCTS with custom_products rows from the database.
//   1. SKUs with is_deleted = true are hidden — EXCEPT core SKUs the engine
//      depends on, which are protected so a stray delete can't break the BOM (#3).
//   2. A non-deleted custom row matching a base SKU overrides cost/price/desc.
//   3. Pure custom products (SKUs not in the base catalog) are appended.
//   4. Result is sorted by CATEGORY_ORDER, then alphabetically by description.
//
// DB rows use the column `description`; the engine/catalog use `desc`. We
// normalize to `desc` here (fix #5).

function normalize(row) {
  return {
    sku: row.sku,
    desc: row.desc ?? row.description ?? '',
    category: row.category,
    technology: row.technology ?? '',
    cost: Number(row.cost),
    price: Number(row.price),
    vendor: row.vendor ?? '',
    preferred_vendor: row.preferred_vendor ?? '',
    product_line: row.product_line ?? '',
    discount_pct: row.discount_pct ?? null,
    isCustom: row.is_custom ?? row.isCustom ?? false,
  };
}

export function mergeProducts(customRows = []) {
  const deleted = new Set(
    customRows
      .filter((r) => r.is_deleted && !CORE_SKUS.has(r.sku))
      .map((r) => r.sku)
  );

  const overrides = new Map();
  for (const row of customRows) {
    if (row.is_deleted) continue;
    overrides.set(row.sku, normalize(row));
  }

  const baseSkus = new Set(BASE_PRODUCTS.map((p) => p.sku));

  const merged = [];

  // Base products (optionally overridden, optionally hidden).
  for (const base of BASE_PRODUCTS) {
    if (deleted.has(base.sku)) continue;
    const override = overrides.get(base.sku);
    merged.push(
      override
        ? { ...base, ...override, technology: override.technology || base.technology, isCustom: false, isOverridden: true }
        : { ...base, product_line: base.product_line ?? '', isCustom: false, isOverridden: false }
    );
  }

  // Pure custom products (not in the base catalog). Rows predating the
  // technology dimension (local mode) default to Managed Wi-Fi like the
  // DB backfill.
  for (const row of customRows) {
    if (row.is_deleted) continue;
    if (baseSkus.has(row.sku)) continue;
    const n = normalize(row);
    merged.push({ ...n, technology: n.technology || 'managed_wifi', isCustom: true, isOverridden: false });
  }

  const orderIndex = (cat) => {
    const i = CATEGORY_ORDER.indexOf(cat);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };

  merged.sort((a, b) => {
    const c = orderIndex(a.category) - orderIndex(b.category);
    if (c !== 0) return c;
    return (a.desc || '').localeCompare(b.desc || '');
  });

  return merged;
}
