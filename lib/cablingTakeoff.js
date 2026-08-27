// Structured-cabling takeoff — complex-project Builder, Phase 4. Derives
// each run type's quantity from the property model (and the Wi-Fi coverage
// rules for in-unit drops), applies any hand-entered counts, and prices the
// runs with Cabling SKUs (cost / price per drop). Runs quote as Digital
// Infrastructure SERVICE lines: they are install work, so shipping never
// applies and the customer proposal groups them under Installation & Labor.
// Pure.

import { CABLING_RUN_TYPES } from './cablingRuns';
import { normalizePropertyModel, propertyTotals } from './propertyModel';
import { buildWifiTakeoff } from './wifiTakeoff';
import { productsBySku } from './assemblies';

const n0 = (v) => Math.max(0, Number(v) || 0);

// buildingId → number of telecom rooms serving that building's levels.
function roomsPerBuilding(model) {
  const byBuilding = new Map();
  for (const b of model.buildings) byBuilding.set(b.id, new Set());
  for (const l of model.levels) {
    if (l.roomId && byBuilding.has(l.buildingId)) byBuilding.get(l.buildingId).add(l.roomId);
  }
  return byBuilding;
}

// In-unit AP count for the in-unit drops: the Wi-Fi coverage rules when
// the quote designs from the property model, else one AP per unit.
export function unitApCount(model, inputs) {
  if (inputs?.wifiTakeoff?.enabled) return buildWifiTakeoff(model, inputs.wifiTakeoff).unitAPs;
  return propertyTotals(normalizePropertyModel(model)).units;
}

// { [key]: { key, label, hint, derived, qty, entered, sku, enabled } }
export function deriveCablingRuns(value, { inputs = null, unitAPs = null } = {}) {
  const model = normalizePropertyModel(value);
  const totals = propertyTotals(model);
  const perBuilding = roomsPerBuilding(model);
  const aps = unitAPs ?? unitApCount(model, inputs);
  const listSum = (list) => list.reduce((s, i) => s + i.qty, 0);

  // Phase 8: under XGS-PON the lit fiber carries each unit, so the Cat6
  // run to the unit derives to zero (an entered count keeps copper too).
  const pon = model.architecture === 'xgs_pon';
  const derivedFor = (rule, key) => {
    switch (rule) {
      case 'one':
        return model.rooms.length > 0 ? 1 : 0;
      case 'perBuilding':
        return [...perBuilding.values()].filter((rooms) => rooms.size > 0).length;
      case 'chain':
        return [...perBuilding.values()].reduce((s, rooms) => s + Math.max(0, rooms.size - 1), 0);
      case 'perUnit':
        return pon && key === 'unitCat6' ? 0 : totals.units;
      case 'perUnitAP':
        return n0(aps);
      case 'perLocation':
        return listSum(model.amenityLocations) + listSum(model.outdoorLocations) + model.otherDrops.filter((d) => d.included).reduce((s, d) => s + d.qty, 0);
      case 'perTownhome':
        return totals.byClass.th ?? 0;
      default:
        return 0;
    }
  };

  const out = {};
  for (const type of CABLING_RUN_TYPES) {
    const s = model.cabling.runs[type.key] ?? {};
    const derived = derivedFor(type.derive, type.key);
    const entered = s.qty !== null && s.qty !== undefined;
    out[type.key] = {
      key: type.key,
      label: type.label,
      hint: pon && type.key === 'unitCat6' ? 'XGS-PON: the lit fiber carries the unit — enter a count to keep copper too' : type.hint,
      derived,
      qty: entered ? n0(s.qty) : derived,
      entered,
      sku: s.sku || type.defaultSku,
      enabled: s.enabled !== false,
    };
  }
  return out;
}

// Priced lines in the TechnologyPage custom-line shape, one per enabled run
// with a quantity. Missing SKUs come through at 0 with `missing` so the UI
// can point at the catalog.
export function computeCablingLines(value, products = [], ctx = {}) {
  const model = normalizePropertyModel(value);
  if (!model.cabling.enabled) return [];
  const runs = deriveCablingRuns(model, ctx);
  const bySku = productsBySku(products);
  const lines = [];
  for (const type of CABLING_RUN_TYPES) {
    const run = runs[type.key];
    if (!run.enabled || run.qty <= 0 || !run.sku) continue;
    const p = bySku.get(run.sku);
    lines.push({
      sku: p?.sku ?? run.sku,
      description: p ? p.desc : `${run.sku} — not in this catalog`,
      category: 'Cabling',
      isService: true,
      qty: run.qty,
      cost: n0(p?.cost),
      price: n0(p?.price),
      missing: !p,
      runKey: type.key,
      note: `${type.label} · ${run.entered ? 'entered' : 'derived'}`,
    });
  }
  return lines;
}

export function cablingTotals(lines) {
  return lines.reduce(
    (t, l) => ({ cost: t.cost + l.qty * l.cost, price: t.price + l.qty * l.price, runs: t.runs + l.qty }),
    { cost: 0, price: 0, runs: 0 }
  );
}
