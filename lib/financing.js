// Financing — complex-project Builder, Phase 7. Turns a proposal's one-time
// investment into level monthly payments over one or more terms, and shows
// the price uplift a lender's discount forces when the contract is sold.
// Team defaults live at companies.settings.financing; a quote switches
// financing on and overrides any field at inputs.financing (null = team
// defaults, the pricing-policy pattern). Pure.
//
//   payment  = P · r / (1 − (1 + r)^−n)   r = APR / 12, n = months
//   uplift   = P · d / (1 − d)            so that (P + uplift) · (1 − d) = P
//
// Payments are computed on the uplifted price — the customer finances what
// the lender will fund at par.

export const FINANCING_BASES = ['total', 'managedWifi'];
export const FINANCING_BASIS_LABELS = { total: 'Total investment', managedWifi: 'Managed Wi-Fi (hardware + labor)' };

export const DEFAULT_FINANCING = {
  enabled: false,
  basis: 'total',
  apr: 12,
  terms: [36, 60],
  lenderDiscountPct: 0,
};

const n0 = (v) => Math.max(0, Number(v) || 0);
const pct = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function normalizeTerms(raw) {
  if (!Array.isArray(raw)) return null;
  const terms = [...new Set(raw.map((t) => Math.round(Number(t) || 0)).filter((t) => t > 0 && t <= 240))];
  return terms.sort((a, b) => a - b);
}

// raw over base: every field the override leaves out comes from base.
export function normalizeFinancing(raw, base = DEFAULT_FINANCING) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const terms = normalizeTerms(r.terms);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : base.enabled,
    basis: FINANCING_BASES.includes(r.basis) ? r.basis : base.basis,
    apr: pct(r.apr) ?? base.apr,
    terms: terms && terms.length ? terms : [...base.terms],
    lenderDiscountPct: Math.min(95, pct(r.lenderDiscountPct) ?? base.lenderDiscountPct),
  };
}

// The team's defaults with the quote's overrides.
export function resolveFinancing(companySettings, quoteOverride) {
  const team = normalizeFinancing(companySettings?.financing);
  return normalizeFinancing(quoteOverride, team);
}

// Level payment on `principal` over `months` at an annual rate (ordinary
// annuity; 0% divides evenly).
export function monthlyPayment(principal, months, apr) {
  const P = n0(principal);
  const n = Math.max(1, Math.round(n0(months)));
  const r = n0(apr) / 1200;
  if (P === 0) return 0;
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

export function paymentFactor(months, apr) {
  return monthlyPayment(1, months, apr);
}

// The price increase that nets the cash price after the lender's discount.
export function upliftFor(principal, lenderDiscountPct) {
  const d = Math.min(0.95, Math.max(0, n0(lenderDiscountPct) / 100));
  return d > 0 ? (n0(principal) * d) / (1 - d) : 0;
}

// Which sell-price bucket the payments are computed on.
export function principalFor(policy, summary) {
  const s = summary ?? {};
  const hw = n0(s.hardware?.price);
  const labor = n0(s.labor?.price);
  const total = n0(s.total?.price);
  return policy?.basis === 'managedWifi' ? hw + labor : total;
}

// policy = a normalized financing config; principal = the sell price being
// financed; units = the property's unit count for the per-unit figure.
export function computeFinancing(policy, { principal = 0, units = 0 } = {}) {
  const p = normalizeFinancing(policy);
  const P = n0(principal);
  const u = n0(units);
  const uplift = upliftFor(P, p.lenderDiscountPct);
  const financedPrice = P + uplift;
  const options = p.terms.map((months) => {
    const monthly = monthlyPayment(financedPrice, months, p.apr);
    const total = monthly * months;
    return {
      months,
      factor: paymentFactor(months, p.apr),
      monthly,
      total,
      financeCharge: total - financedPrice,
      perUnitMonth: u > 0 ? monthly / u : 0,
    };
  });
  return {
    enabled: p.enabled,
    basis: p.basis,
    apr: p.apr,
    lenderDiscountPct: p.lenderDiscountPct,
    principal: P,
    uplift,
    financedPrice,
    units: u,
    options,
  };
}
