// Pricing policy — complex-project Builder, Phase 5. How a quote turns
// catalog cost into sell price:
//   'catalog'  — every product's own list price (the behavior until now)
//   'costPlus' — cost × (1 + markup % by subcategory), the way a takeoff
//                sheet prices: 25% on gateways / core / racks, 40% on APs,
//                50% on edge switches, 60% on optics, 25% on misc — the
//                defaults David locked on 2026-08-27.
// The company default lives at companies.settings.pricingPolicy; a quote
// picks its own MODE at inputs.pricingPolicy.mode (the markups stay the
// team's). A category marked null keeps its list price — Cabling runs and
// Service SKUs already carry a per-drop / per-hour sell price. Kits price as
// a whole (rolled-up cost × their own category's markup). Pure.

export const PRICING_MODES = ['catalog', 'costPlus'];

export const DEFAULT_MARKUP_BY_CATEGORY = {
  Gateway: 25,
  'Aggregate Switch': 25,
  'Access Point': 40,
  Switch: 50,
  'Fiber Module': 60,
  Rack: 25,
  'Rack Accessory': 25,
  UPS: 25,
  Fiber: 25,
  Cable: 25,
  Enclosure: 40,
  Mounting: 25,
  Miscellaneous: 25,
  Subscription: 40,
  License: 40,
  Software: 40,
  Camera: 40,
  NVR: 40,
  Storage: 25,
  'Smart Device': 40,
  'Door Controller': 40,
  'EV Charger': 40,
  Cabling: null,
  Service: null,
};

export const DEFAULT_PRICING_POLICY = {
  mode: 'catalog',
  defaultMarkupPct: 25,
  markupByCategory: DEFAULT_MARKUP_BY_CATEGORY,
};

const pctOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

export function normalizePricingPolicy(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const mode = PRICING_MODES.includes(r.mode) ? r.mode : DEFAULT_PRICING_POLICY.mode;
  const defaultMarkupPct = pctOrNull(r.defaultMarkupPct) ?? DEFAULT_PRICING_POLICY.defaultMarkupPct;
  const markupByCategory = { ...DEFAULT_MARKUP_BY_CATEGORY };
  if (r.markupByCategory && typeof r.markupByCategory === 'object') {
    for (const [cat, v] of Object.entries(r.markupByCategory)) {
      if (!String(cat).trim()) continue;
      // An explicit null / '' means "keep list price"; a number is a markup.
      markupByCategory[cat] = pctOrNull(v);
    }
  }
  return { mode, defaultMarkupPct, markupByCategory };
}

// The team's policy with the quote's mode choice (null = team default).
export function resolvePricingPolicy(companySettings, quoteOverride) {
  const base = normalizePricingPolicy(companySettings?.pricingPolicy);
  const mode = PRICING_MODES.includes(quoteOverride?.mode) ? quoteOverride.mode : base.mode;
  return { ...base, mode };
}

// Markup % for a subcategory, or null when that category keeps list price.
export function markupFor(policy, category) {
  const map = policy?.markupByCategory ?? DEFAULT_MARKUP_BY_CATEGORY;
  if (category && Object.prototype.hasOwnProperty.call(map, category)) return map[category];
  return policy?.defaultMarkupPct ?? DEFAULT_PRICING_POLICY.defaultMarkupPct;
}

// Full precision on purpose: a takeoff sheet extends cost × (1 + markup)
// without rounding each unit price, and totals must land on the cent
// exactly the same way. Display formatting rounds for the eye.
export function priceWithMarkup(cost, pct) {
  return (Number(cost) || 0) * (1 + (Number(pct) || 0) / 100);
}

// The priced catalog every quoting path reads. Under 'catalog' the input
// array is returned as-is (memo-stable); under cost-plus each product is
// re-priced from its cost, keeping the list price alongside for display.
export function applyPricingPolicy(products, policy) {
  const list = products ?? [];
  if (!policy || policy.mode !== 'costPlus') return list;
  return list.map((p) => {
    const pct = markupFor(policy, p.category);
    if (pct === null || pct === undefined) {
      return { ...p, listPrice: p.price, policyMode: 'costPlus', policyMarkupPct: null };
    }
    return { ...p, listPrice: p.price, price: priceWithMarkup(p.cost, pct), policyMode: 'costPlus', policyMarkupPct: pct };
  });
}

// A line that belongs to another product (a linked license) sells at its
// device's markup under cost-plus; null when no policy applies.
export function inheritedPrice(ownerProduct, cost) {
  if (ownerProduct?.policyMode !== 'costPlus') return null;
  if (ownerProduct.policyMarkupPct === null || ownerProduct.policyMarkupPct === undefined) return null;
  return priceWithMarkup(cost, ownerProduct.policyMarkupPct);
}

// Sell price for a computed allowance line (the misc-hardware percentage)
// under the policy: cost × (1 + its category's markup); null otherwise.
export function policyPriceFor(product, cost) {
  return inheritedPrice(product, cost);
}
