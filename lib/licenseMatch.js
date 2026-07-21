// Matches catalog License/Subscription products to hardware by SKU and
// description, so linked-license fields (0061) can be picked from a dropdown
// or auto-filled instead of hand-typed. Pure functions.

// Term markers seen in real price books: "1 Year", "1yr", "1-yr" in the SKU
// or description, and the Cambium-style "-5" SKU suffix (MSX-SUB-XV2-21X-5).
// The suffix pattern anchors to the SKU alone and requires a leading hyphen,
// so a "-1001" style SKU never reads as a 1-year term.
const TERM_RES = {
  1: { text: [/\b1[\s-]?(yr|year)s?\b/i, /-1yr\b/i], sku: [/-1$/] },
  3: { text: [/\b3[\s-]?(yr|year)s?\b/i, /-3yr\b/i], sku: [/-3$/] },
  5: { text: [/\b5[\s-]?(yr|year)s?\b/i, /-5yr\b/i], sku: [/-5$/] },
};

export function isLicenseProduct(p) {
  return p?.category === 'License' || p?.category === 'Subscription';
}

export function matchesTerm(p, term) {
  const sku = String(p.sku ?? '').trim();
  const text = `${sku} ${p.desc ?? p.description ?? ''}`;
  const res = TERM_RES[term];
  if (!res) return false;
  return res.text.some((re) => re.test(text)) || res.sku.some((re) => re.test(sku));
}

const mentionsSku = (p, skuLower) =>
  skuLower && `${p.sku} ${p.desc ?? p.description ?? ''}`.toLowerCase().includes(skuLower);

// Licenses offered in a product's dropdowns: License/Subscription products in
// the same technology, the ones that mention the product's SKU ranked first.
export function licenseCandidates(product, allProducts = []) {
  const skuLower = (product?.sku ?? '').trim().toLowerCase();
  const tech = product?.technology ?? '';
  return allProducts
    .filter(
      (p) => isLicenseProduct(p) && p.sku !== product?.sku && (!tech || (p.technology ?? '') === tech)
    )
    .sort(
      (a, b) =>
        Number(mentionsSku(b, skuLower)) - Number(mentionsSku(a, skuLower)) ||
        String(a.sku).localeCompare(String(b.sku))
    );
}

// Best guess per term. Deliberately conservative: only licenses that MENTION
// the product's SKU are considered (term-only matching across a whole catalog
// would mislink), so vendors whose license SKUs don't embed the hardware SKU
// simply guess null and the user picks from the dropdown.
export function guessLicenses(product, allProducts = []) {
  const skuLower = (product?.sku ?? '').trim().toLowerCase();
  const mentions = licenseCandidates(product, allProducts).filter((p) => mentionsSku(p, skuLower));
  const out = {};
  for (const t of [1, 3, 5]) {
    out[`license_sku_${t}yr`] = mentions.find((p) => matchesTerm(p, t))?.sku ?? null;
  }
  return out;
}
