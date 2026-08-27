// Recurring charges — complex-project Builder, Phase 7. The monthly side of
// a proposal: carrier internet circuits, a per-unit support fee, software
// billed annually, anything else that recurs. A quote keeps its items at
// inputs.recurring; the team's carrier rate card (bandwidth × term → MRC)
// lives at companies.settings.carrierCircuits. Every amount is quoted the
// way the vendor bills it (per month or per year, flat or per unit) and
// normalized to a monthly cost / price here. Pure.

export const RECURRING_KINDS = ['circuit', 'support', 'license', 'other'];
export const RECURRING_KIND_LABELS = {
  circuit: 'Internet circuit',
  support: 'Support',
  license: 'Software',
  other: 'Other',
};
export const RECURRING_PERIODS = ['month', 'year'];
export const AMOUNT_BASES = ['flat', 'per_unit'];

// The carrier quotes the Muze workbook carried (Segra on a 5-year term;
// Frontier on 3- and 5-year terms) — the starting rate card a team edits in
// Settings → Pricing. MRC = the carrier's monthly recurring charge.
export const DEFAULT_CARRIER_CIRCUITS = [
  { id: 'segra-1g-60', carrier: 'Segra', bandwidth: '1 Gb', termMonths: 60, mrc: 1095 },
  { id: 'segra-2g-60', carrier: 'Segra', bandwidth: '2 Gb', termMonths: 60, mrc: 1395 },
  { id: 'segra-5g-60', carrier: 'Segra', bandwidth: '5 Gb', termMonths: 60, mrc: 1695 },
  { id: 'segra-10g-60', carrier: 'Segra', bandwidth: '10 Gb', termMonths: 60, mrc: 1995 },
  { id: 'frontier-1g-36', carrier: 'Frontier', bandwidth: '1 Gb', termMonths: 36, mrc: 1100 },
  { id: 'frontier-2g-36', carrier: 'Frontier', bandwidth: '2 Gb', termMonths: 36, mrc: 1360 },
  { id: 'frontier-5g-36', carrier: 'Frontier', bandwidth: '5 Gb', termMonths: 36, mrc: 2200 },
  { id: 'frontier-10g-36', carrier: 'Frontier', bandwidth: '10 Gb', termMonths: 36, mrc: 3100 },
  { id: 'frontier-1g-60', carrier: 'Frontier', bandwidth: '1 Gb', termMonths: 60, mrc: 975 },
  { id: 'frontier-2g-60', carrier: 'Frontier', bandwidth: '2 Gb', termMonths: 60, mrc: 1150 },
  { id: 'frontier-5g-60', carrier: 'Frontier', bandwidth: '5 Gb', termMonths: 60, mrc: 2000 },
  { id: 'frontier-10g-60', carrier: 'Frontier', bandwidth: '10 Gb', termMonths: 60, mrc: 2750 },
];

const n0 = (v) => Math.max(0, Number(v) || 0);
const sum = (list, pick) => list.reduce((acc, x) => acc + pick(x), 0);

let seq = 0;
export function newRecurringId() {
  seq += 1;
  return `rc-${Date.now().toString(36)}-${seq}`;
}

// ── Carrier rate card (team setting) ───────────────────────────────────

// undefined / non-array → the defaults; an array (even empty) is the
// team's own card. Rows without a carrier or bandwidth are dropped.
export function normalizeCarrierCircuits(raw) {
  if (!Array.isArray(raw)) return DEFAULT_CARRIER_CIRCUITS.map((c) => ({ ...c }));
  return raw
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => {
      const term = Math.round(n0(c.termMonths));
      return {
        id: c.id ?? `cc-${i}`,
        carrier: String(c.carrier ?? '').trim(),
        bandwidth: String(c.bandwidth ?? '').trim(),
        termMonths: term > 0 ? term : 36,
        mrc: n0(c.mrc),
      };
    })
    .filter((c) => c.carrier || c.bandwidth);
}

export function circuitLabel(c) {
  return `${c.bandwidth} fiber circuit — ${c.carrier}`.trim();
}

// ── Items (quote inputs) ───────────────────────────────────────────────

export function normalizeRecurringItem(raw, i = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const term = r.termMonths === null || r.termMonths === undefined || r.termMonths === '' ? null : Math.max(1, Math.round(n0(r.termMonths)));
  return {
    id: r.id ?? `rc-${i}`,
    kind: RECURRING_KINDS.includes(r.kind) ? r.kind : 'other',
    label: String(r.label ?? '').trim(),
    carrier: r.carrier ? String(r.carrier) : null,
    bandwidth: r.bandwidth ? String(r.bandwidth) : null,
    termMonths: term,
    period: RECURRING_PERIODS.includes(r.period) ? r.period : 'month',
    qty: Math.max(1, Math.round(n0(r.qty))),
    cost: n0(r.cost),
    costBasis: AMOUNT_BASES.includes(r.costBasis) ? r.costBasis : 'flat',
    price: n0(r.price),
    priceBasis: AMOUNT_BASES.includes(r.priceBasis) ? r.priceBasis : 'flat',
    // false hides the line from customer documents (it still counts).
    customer: r.customer !== false,
  };
}

export function normalizeRecurring(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { items: Array.isArray(r.items) ? r.items.map((it, i) => normalizeRecurringItem(it, i)) : [] };
}

// Factories for the "Add" menu.
export function circuitItem(circuit, { price = null, id = null } = {}) {
  const c = circuit ?? {};
  return normalizeRecurringItem({
    id: id ?? newRecurringId(),
    kind: 'circuit',
    label: circuitLabel(c),
    carrier: c.carrier,
    bandwidth: c.bandwidth,
    termMonths: c.termMonths,
    period: 'month',
    qty: 1,
    cost: c.mrc,
    costBasis: 'flat',
    // Carrier circuits bill at retail by default; the team can mark them up.
    price: price ?? c.mrc,
    priceBasis: 'flat',
  });
}

export function supportFeeItem({ label = 'Managed network support', cost = 0, pricePerUnit = 0, id = null } = {}) {
  return normalizeRecurringItem({
    id: id ?? newRecurringId(),
    kind: 'support',
    label,
    period: 'month',
    qty: 1,
    cost,
    costBasis: 'flat',
    price: pricePerUnit,
    priceBasis: 'per_unit',
  });
}

export function licenseItem({ label = 'Software subscription', annualCost = 0, annualPrice = null, id = null } = {}) {
  return normalizeRecurringItem({
    id: id ?? newRecurringId(),
    kind: 'license',
    label,
    period: 'year',
    qty: 1,
    cost: annualCost,
    costBasis: 'flat',
    price: annualPrice ?? annualCost,
    priceBasis: 'flat',
  });
}

export function otherItem({ label = 'Recurring service', id = null } = {}) {
  return normalizeRecurringItem({ id: id ?? newRecurringId(), kind: 'other', label, period: 'month', qty: 1 });
}

// ── Compute ────────────────────────────────────────────────────────────

export function monthlyOf(amount, period) {
  return period === 'year' ? n0(amount) / 12 : n0(amount);
}

export function recurringLine(item, units = 0) {
  const it = normalizeRecurringItem(item);
  const u = n0(units);
  const mult = (basis) => (basis === 'per_unit' ? u : 1);
  const monthlyCost = monthlyOf(it.cost, it.period) * mult(it.costBasis) * it.qty;
  const monthlyPrice = monthlyOf(it.price, it.period) * mult(it.priceBasis) * it.qty;
  return {
    ...it,
    monthlyCost,
    monthlyPrice,
    annualCost: monthlyCost * 12,
    annualPrice: monthlyPrice * 12,
  };
}

// recurring = inputs.recurring (raw); units = the property's unit count.
export function computeRecurring(recurring, { units = 0 } = {}) {
  const lines = normalizeRecurring(recurring).items.map((it) => recurringLine(it, units));
  const u = n0(units);
  const monthlyCost = sum(lines, (l) => l.monthlyCost);
  const monthlyPrice = sum(lines, (l) => l.monthlyPrice);
  return {
    lines,
    units: u,
    hasItems: lines.length > 0,
    totals: {
      monthlyCost,
      monthlyPrice,
      annualCost: monthlyCost * 12,
      annualPrice: monthlyPrice * 12,
      perUnitMonth: u > 0 ? monthlyPrice / u : 0,
      grossProfit: monthlyPrice - monthlyCost,
      margin: monthlyPrice > 0 ? ((monthlyPrice - monthlyCost) / monthlyPrice) * 100 : 0,
    },
  };
}

export function termTotal(monthly, months) {
  return n0(monthly) * Math.max(0, Math.round(n0(months)));
}
