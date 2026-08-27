// Assemblies (kits) — complex-project Builder, Phase 3. A catalog product
// with `components: [{ sku, qty, unitCost?, unitPrice?, note? }]` is a kit:
// its cost and price roll up from the component products — live, so a
// part's price change reprices every kit that uses it — and it quotes as
// ONE line (telecom-room rack kits, in-unit media panels, PON bundles…).
// A component may pin its own unit cost / price for this kit ("as quoted"
// by a distributor for the bundle). Kits nest one practical level: a kit
// inside a kit is priced at the inner kit's rolled-up value.
//
// Pure. Consumers: hooks/useProducts (rollUpAssemblies over the merged
// catalog), the products API (normalizeComponents), ProductModal (live
// preview), Digital Infrastructure lines (componentsResolved for the
// expandable parts list), and the Product Database's kit chip.

const round2 = (n) => Math.round(n * 100) / 100;
const MAX_COMPONENTS = 100;
const num = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function isAssembly(product) {
  return Array.isArray(product?.components) && product.components.length > 0;
}

// Clean a components payload (API body, modal form, import). null when
// nothing usable remains — the product is then a plain product.
export function normalizeComponents(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const c of raw) {
    if (!c) continue;
    const sku = String(c.sku ?? '').trim();
    const qty = num(c.qty);
    if (!sku || qty === null || qty <= 0) continue;
    const entry = { sku, qty: round2(qty) };
    const unitCost = num(c.unitCost);
    const unitPrice = num(c.unitPrice);
    if (unitCost !== null && unitCost >= 0) entry.unitCost = round2(unitCost);
    if (unitPrice !== null && unitPrice >= 0) entry.unitPrice = round2(unitPrice);
    if (c.note) entry.note = String(c.note).slice(0, 200);
    out.push(entry);
    if (out.length >= MAX_COMPONENTS) break;
  }
  return out.length ? out : null;
}

// Catalog lookup keyed by both the display sku and the base identity.
export function productsBySku(products) {
  const map = new Map();
  for (const p of products ?? []) {
    if (!p?.sku) continue;
    map.set(p.sku, p);
    if (p.baseSku && p.baseSku !== p.sku) map.set(p.baseSku, p);
  }
  return map;
}

// Roll one kit up: totals plus a resolved parts list for display.
export function assemblyRollUp(components, bySku) {
  const resolved = [];
  const missing = [];
  let cost = 0;
  let price = 0;
  for (const c of components ?? []) {
    const p = bySku.get(c.sku);
    const catalogCost = Number(p?.cost) || 0;
    const catalogPrice = Number(p?.price) || 0;
    const pinnedCost = num(c.unitCost);
    const pinnedPrice = num(c.unitPrice);
    if (!p && pinnedCost === null) missing.push(c.sku);
    const unitCost = pinnedCost ?? catalogCost;
    // A pinned cost without a pinned price keeps the part's own markup.
    const ratio = catalogCost > 0 ? catalogPrice / catalogCost : 1;
    const unitPrice = pinnedPrice ?? (pinnedCost !== null ? round2(pinnedCost * ratio) : catalogPrice);
    const totalCost = round2(unitCost * c.qty);
    const totalPrice = round2(unitPrice * c.qty);
    cost += totalCost;
    price += totalPrice;
    resolved.push({
      sku: c.sku,
      qty: c.qty,
      desc: p?.desc ?? '(not in catalog)',
      category: p?.category ?? null,
      unitCost,
      unitPrice,
      totalCost,
      totalPrice,
      pinned: pinnedCost !== null || pinnedPrice !== null,
      note: c.note ?? '',
      missing: !p,
    });
  }
  return { cost: round2(cost), price: round2(price), resolved, missing };
}

// Replace every kit's cost / price with its roll-up. Plain products are
// returned as the same objects. Runs a few passes so a kit that contains a
// kit prices from the inner roll-up; a cycle simply stops after the last
// pass with whatever values it reached.
export function rollUpAssemblies(products) {
  const list = products ?? [];
  if (!list.some(isAssembly)) return list;
  const bySku = productsBySku(list);
  let current = list;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    const next = current.map((p) => {
      if (!isAssembly(p)) return p;
      const r = assemblyRollUp(p.components, bySku);
      if (p.isAssembly && p.cost === r.cost && p.price === r.price) return p;
      changed = true;
      return { ...p, isAssembly: true, cost: r.cost, price: r.price, componentsResolved: r.resolved, assemblyMissing: r.missing };
    });
    for (const p of next) {
      if (!isAssembly(p)) continue;
      bySku.set(p.sku, p);
      if (p.baseSku && p.baseSku !== p.sku) bySku.set(p.baseSku, p);
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

// A kit line's parts as quote lines (qty × line quantity) — for a parts
// appendix or a purchase list.
export function explodeAssembly(product, qty = 1) {
  const parts = product?.componentsResolved ?? [];
  return parts.map((c) => ({
    sku: c.sku,
    description: c.desc,
    category: c.category ?? 'Miscellaneous',
    qty: round2(c.qty * qty),
    cost: c.unitCost,
    price: c.unitPrice,
    fromKit: product.sku,
  }));
}
