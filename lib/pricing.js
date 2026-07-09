const round2 = (n) => Math.round(n * 100) / 100;

// Cost is derived from a vendor's discount off list price:
//   cost = price × (1 − discount%)
export function costFromDiscount(price, discountPercent) {
  const p = Number(price) || 0;
  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return round2(p * (1 - d / 100));
}

// Seed values from the Cambium discount key — editable afterward in
// Settings → Pricing. Only used to pre-fill the form the first time a team
// opens it (i.e. when companies.settings.productLineDiscounts is empty).
export const DEFAULT_PRODUCT_LINE_DISCOUNTS = {
  cnWave: 28,
  Accessories: 28,
  'Cambium Care': 7,
  'Ext. Warranty': 28,
  CnMaestroX: 62,
  Switches: 59,
  "AP's Outdoor": 60,
  "AP's Indoor": 68,
};
