// Design options — complex-project Builder, Phase 6. A property quoted
// several ways is a group of sibling quotes (saved_projects.option_group_id);
// each quote carries a `summary` written at save time so a group can be
// compared without re-running every engine. This module builds that
// summary from the Builder's live sections and turns a group's summaries
// into comparison rows (internal and customer-safe). Pure.

import { primarySections } from './vendorComparison';

const n0 = (v) => Math.max(0, Number(v) || 0);
const round2 = (n) => Math.round(n * 100) / 100;

export const DEFAULT_TERM_MONTHS = 60;

// ── Summary (written by the Builder on every save) ─────────────────────

// sections = exportSections() (all techs, labor last); labor = the rate-card
// section; bom = the Wi-Fi engine result; inputs = the quote's inputs.
export function buildQuoteSummary({ sections = [], labor = null, bom = {}, inputs = {}, pricingMode = 'catalog', unitsHint = 0 } = {}) {
  const present = primarySections(sections).filter((s) => s?.bom && !s.isLabor);
  let hwCost = 0;
  let hwPrice = 0;
  let cablingCost = 0;
  let cablingPrice = 0;
  let svcCost = 0;
  let svcPrice = 0;
  for (const s of present) {
    const b = s.bom;
    hwCost += n0(b.totalHardwareCost) + n0(b.shippingCost);
    hwPrice += n0(b.totalHardwarePrice) + n0(b.shippingPrice);
    for (const line of b.serviceItems ?? []) {
      if (line.category === 'Cabling') {
        cablingCost += n0(line.totalCost);
        cablingPrice += n0(line.totalPrice);
      } else {
        svcCost += n0(line.totalCost);
        svcPrice += n0(line.totalPrice);
      }
    }
  }
  const laborCost = n0(labor?.totalServicesCost) + svcCost;
  const laborPrice = n0(labor?.totalServicesPrice) + svcPrice;
  const techs = [...new Set(present.map((s) => s.techId).filter(Boolean))];
  const di = inputs.techCalc?.digital_infrastructure ?? null;
  const fiberRun = di?.cabling?.runs?.unitFiber;
  const fiberToUnits = !!di && di.cabling?.enabled !== false && (fiberRun?.enabled ?? true) && (fiberRun?.qty === undefined || fiberRun?.qty === null || n0(fiberRun.qty) > 0);

  return {
    units: n0(bom.unitCount) || n0(unitsHint) || n0(inputs.numberOfRooms),
    aps: n0(bom.totalAPs),
    switches: n0(bom.totalIdfSwitches) + (bom.needsAggSwitch ? 1 : 0),
    idfs: n0(bom.idfCount),
    techs,
    wifiGeneration: inputs.wifiGeneration ?? null,
    designSource: inputs.wifiTakeoff?.enabled ? 'property' : 'simple',
    fiberToUnits: techs.includes('digital_infrastructure') ? fiberToUnits : null,
    architecture: di?.architecture ?? 'active_ethernet',
    pricingMode,
    hardware: { cost: round2(hwCost), price: round2(hwPrice) },
    labor: { cost: round2(laborCost), price: round2(laborPrice) },
    cabling: { cost: round2(cablingCost), price: round2(cablingPrice) },
    total: { cost: round2(hwCost + laborCost + cablingCost), price: round2(hwPrice + laborPrice + cablingPrice) },
  };
}

// A stored summary, tolerant of older quotes that only have totals.
export function normalizeSummary(quote) {
  const s = quote?.summary && typeof quote.summary === 'object' ? quote.summary : {};
  const bucket = (b) => ({ cost: n0(b?.cost), price: n0(b?.price) });
  const hardware = bucket(s.hardware);
  const labor = bucket(s.labor);
  const cabling = bucket(s.cabling);
  const total = s.total
    ? bucket(s.total)
    : { cost: n0(quote?.total_cost), price: n0(quote?.total_price) };
  return {
    units: n0(s.units),
    aps: n0(s.aps),
    switches: n0(s.switches),
    idfs: n0(s.idfs),
    techs: Array.isArray(s.techs) ? s.techs : [],
    wifiGeneration: s.wifiGeneration ?? null,
    designSource: s.designSource ?? null,
    fiberToUnits: typeof s.fiberToUnits === 'boolean' ? s.fiberToUnits : null,
    architecture: s.architecture ?? null,
    pricingMode: s.pricingMode ?? null,
    hardware,
    labor,
    cabling,
    total,
    hasBuckets: !!s.total,
  };
}

export const ARCHITECTURE_LABELS = { active_ethernet: 'Active Ethernet', xgs_pon: 'XGS-PON (FTTU)' };
const WIFI_LABELS = { wifi6: 'Wi-Fi 6', wifi7: 'Wi-Fi 7' };

// ── Comparison ─────────────────────────────────────────────────────────
// options: [{ id, label, notes, quote }] in display order — the first is
// the baseline every delta measures against. Rows carry `customer: true`
// when they belong on the customer document (no cost, no margin).
export function buildOptionComparison(options, { termMonths = DEFAULT_TERM_MONTHS, units = null } = {}) {
  const cols = (options ?? []).map((o) => ({
    id: o.id,
    label: o.label || o.quote?.option_label || o.quote?.project_name || 'Option',
    notes: o.notes ?? o.quote?.option_notes ?? '',
    status: o.quote?.status ?? 'draft',
    version: o.quote?.version ?? 1,
    summary: normalizeSummary(o.quote),
  }));
  const unitCount = n0(units) || Math.max(0, ...cols.map((c) => c.summary.units));
  const term = Math.max(1, n0(termMonths) || DEFAULT_TERM_MONTHS);

  const row = (key, label, kind, pick, extra = {}) => {
    const values = cols.map((c) => pick(c.summary));
    const numeric = kind === 'money' || kind === 'percent' || kind === 'number';
    const deltas = numeric ? values.map((v, i) => (i === 0 ? null : (Number(v) || 0) - (Number(values[0]) || 0))) : values.map(() => null);
    return { key, label, kind, values, deltas, customer: false, higherIsBetter: false, ...extra };
  };
  const managedWifiPrice = (s) => s.hardware.price + s.labor.price;

  const rows = [
    row('hardwareCost', 'Hardware & equipment — cost', 'money', (s) => s.hardware.cost),
    row('hardwarePrice', 'Hardware & equipment', 'money', (s) => s.hardware.price, { customer: true }),
    row('laborCost', 'Installation & labor — cost', 'money', (s) => s.labor.cost),
    row('laborPrice', 'Installation & labor', 'money', (s) => s.labor.price, { customer: true }),
    row('cablingCost', 'Structured cabling — cost', 'money', (s) => s.cabling.cost),
    row('cablingPrice', 'Structured cabling', 'money', (s) => s.cabling.price, { customer: true }),
    row('managedWifiPrice', 'Managed Wi-Fi (hardware + labor)', 'money', managedWifiPrice, { customer: true }),
    row('perUnitPerMonth', `Per unit per month · ${term} months`, 'money', (s) => (unitCount > 0 ? managedWifiPrice(s) / unitCount / term : 0), { customer: true, precise: true }),
    row('totalCost', 'Total — cost', 'money', (s) => s.total.cost),
    row('totalPrice', 'Total investment', 'money', (s) => s.total.price, { customer: true, total: true }),
    row('grossProfit', 'Gross profit', 'money', (s) => s.total.price - s.total.cost, { higherIsBetter: true }),
    row('margin', 'Margin', 'percent', (s) => (s.total.price > 0 ? ((s.total.price - s.total.cost) / s.total.price) * 100 : 0), { higherIsBetter: true }),
    row('units', 'Units', 'number', (s) => s.units, { customer: true }),
    row('aps', 'Access points', 'number', (s) => s.aps, { customer: true }),
    row('switches', 'Switches', 'number', (s) => s.switches, { customer: true }),
    row('idfs', 'Telecom rooms', 'number', (s) => s.idfs),
    row('wifiGeneration', 'In-unit standard', 'text', (s) => WIFI_LABELS[s.wifiGeneration] ?? s.wifiGeneration ?? '—', { customer: true }),
    row('fiberToUnits', 'Fiber to units', 'text', (s) => (s.fiberToUnits === null ? '—' : s.fiberToUnits ? 'Yes' : 'No'), { customer: true }),
    row('architecture', 'Architecture', 'text', (s) => ARCHITECTURE_LABELS[s.architecture] ?? s.architecture ?? '—', { customer: true }),
    row('pricingMode', 'Pricing', 'text', (s) => (s.pricingMode === 'costPlus' ? 'Cost-plus' : s.pricingMode === 'catalog' ? 'List prices' : '—')),
  ];

  return { columns: cols, rows, units: unitCount, termMonths: term };
}

export function customerRows(comparison) {
  return comparison.rows.filter((r) => r.customer);
}

// "+$1,200.00" / "-$300.00" / "$0.00" — plain hyphen for PDF fonts.
export function signedText(n, fmt) {
  const v = Number(n) || 0;
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${fmt(Math.abs(v))}`;
}

// A group's options in display order: label order if labels look like
// "Option A / Option B", else creation order. Only lineage heads (latest
// version per option) belong in a comparison.
export function optionHeads(quotes, groupId) {
  const members = (quotes ?? []).filter((q) => q.option_group_id === groupId);
  const byRoot = new Map();
  for (const q of members) {
    const key = q.parent_quote_id ?? q.id;
    if (!byRoot.has(key)) byRoot.set(key, []);
    byRoot.get(key).push(q);
  }
  const heads = [...byRoot.values()].map((list) =>
    [...list].sort((a, b) => ((b.version ?? 1) - (a.version ?? 1)) || ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1))[0]
  );
  return heads.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1));
}
