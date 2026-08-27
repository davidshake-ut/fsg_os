// XGS-PON / FTTU takeoff — complex-project Builder, Phase 8. Reads the
// property model (architecture + pon settings) and the Wi-Fi coverage
// rules (through inputs.wifiTakeoff) to size the PON: ONTs, splitters,
// OLTs, optics, injectors, ONUs — then prices them from the catalog and
// carries the provisioning hours. Also resolves the FTTU kit variants the
// architecture implies. Pure.

import { normalizePropertyModel, propertyTotals, KIT_DEFAULTS } from './propertyModel';
import { productsBySku } from './assemblies';
import { unitApCount } from './cablingTakeoff';
import { policyPriceFor } from './pricingPolicy';
import { PON_ROLES, FTTU_KIT_SKUS, derivePonCounts } from './ponModel';

const n0 = (v) => Math.max(0, Number(v) || 0);

export function isPon(value) {
  return normalizePropertyModel(value).architecture === 'xgs_pon';
}

// Telecom rooms whose units are all townhomes — each hosts a multi-port ONU.
export function townhomeRoomCount(model) {
  const m = normalizePropertyModel(model);
  const totals = propertyTotals(m);
  let count = 0;
  for (const room of m.rooms) {
    const served = totals.byRoom[room.id] ?? { units: 0, levelIds: [] };
    const th = served.levelIds.reduce((s, lid) => s + (totals.byLevel[lid]?.byClass?.th ?? 0), 0);
    if (served.units > 0 && th === served.units) count += 1;
  }
  return count;
}

// The default kits follow the architecture: a design still on the
// Active-Ethernet defaults quotes their FTTU variants under XGS-PON; a kit
// chosen by hand is kept either way.
export function effectiveKitSkus(value) {
  const m = normalizePropertyModel(value);
  const swap = (sku, def) => (m.architecture === 'xgs_pon' && sku === def && FTTU_KIT_SKUS[sku] ? FTTU_KIT_SKUS[sku] : sku);
  return {
    mdfSku: swap(m.kits.mdfSku, KIT_DEFAULTS.mdfSku),
    idfSku: swap(m.kits.idfSku, KIT_DEFAULTS.idfSku),
  };
}

// Counts + the settings behind them. ctx: { inputs } (the quote's inputs,
// for the coverage rules) or an explicit { unitAPs }.
export function derivePon(value, { inputs = null, unitAPs = null } = {}) {
  const m = normalizePropertyModel(value);
  const totals = propertyTotals(m);
  const aps = unitAPs ?? unitApCount(m, inputs);
  const counts = derivePonCounts(m.pon, { unitAPs: aps, units: totals.units, townhomeRooms: townhomeRoomCount(m) });
  return { architecture: m.architecture, pon: m.pon, unitAPs: n0(aps), units: totals.units, ...counts };
}

// Priced hardware lines in the TechnologyPage custom-line shape, one per
// PON role with a quantity; [] unless the design is XGS-PON. Support
// subscriptions price at their device's markup under cost-plus.
export function computePonLines(value, products = [], ctx = {}) {
  const m = normalizePropertyModel(value);
  if (m.architecture !== 'xgs_pon') return [];
  const d = derivePon(m, ctx);
  const bySku = productsBySku(products);
  const lines = [];
  for (const role of PON_ROLES) {
    const qty = Math.round(n0(d[role.countKey]));
    if (qty <= 0) continue;
    const sku = m.pon.skus[role.key];
    if (!sku) continue;
    const p = bySku.get(sku);
    if (!p) {
      lines.push({ role: role.key, sku, description: `${sku} — not in this catalog`, category: role.category, qty, cost: 0, price: 0, missing: true, note: role.label });
      continue;
    }
    let price = n0(p.price);
    if (role.licenseOf) {
      const device = bySku.get(m.pon.skus[role.licenseOf]);
      const inherited = device ? policyPriceFor(device, n0(p.cost)) : null;
      if (inherited !== null && inherited !== undefined) price = inherited;
    }
    lines.push({
      role: role.key,
      sku: p.sku,
      description: p.desc,
      category: p.category ?? role.category,
      qty,
      cost: n0(p.cost),
      price,
      note: role.label,
    });
  }
  return lines;
}

// Installation Technician hours the PON adds: provisioning per ONT and
// activation per splitter (PON port).
export function ponLaborHours(value, ctx = {}) {
  const m = normalizePropertyModel(value);
  if (m.architecture !== 'xgs_pon') return { 'install-tech': 0 };
  const d = derivePon(m, ctx);
  return { 'install-tech': d.onts * m.pon.hours.ontProvisioning + d.splitters * m.pon.hours.ponActivation };
}

export function ponTotals(lines) {
  return lines.reduce(
    (acc, l) => ({ cost: acc.cost + l.qty * l.cost, price: acc.price + l.qty * l.price }),
    { cost: 0, price: 0 }
  );
}
