// Digital Infrastructure quote lines — complex-project Builder, Phase 3.
// From the property model: one telecom-room kit per room (the MDF's kit
// for the MDF, the IDF kit elsewhere, a per-room choice when set, none for
// a townhome-only room since each townhome hosts its own switch) and an
// in-unit media panel per unit; plus the install hours those carry. Pure.
// Kit SKUs default to the base-catalog kits (lib/catalog.js) and are
// changed per quote in the Digital Infrastructure rail.

import { normalizePropertyModel, propertyTotals } from './propertyModel';
import { productsBySku } from './assemblies';
import { computeCablingLines } from './cablingTakeoff';
import { computePonLines, ponLaborHours, effectiveKitSkus } from './ponTakeoff';

const n0 = (v) => Math.max(0, Number(v) || 0);

// Each telecom room's role: 'mdf' | 'idf' | 'townhome' (all its units are
// townhomes) plus the units it serves.
export function roomRoles(model) {
  const m = normalizePropertyModel(model);
  const totals = propertyTotals(m);
  return m.rooms.map((room) => {
    const served = totals.byRoom[room.id] ?? { units: 0, levelIds: [] };
    const thUnits = served.levelIds.reduce((s, lid) => s + (totals.byLevel[lid]?.byClass?.th ?? 0), 0);
    const townhome = served.units > 0 && thUnits === served.units;
    return { room, kind: townhome ? 'townhome' : room.isMdf ? 'mdf' : 'idf', units: served.units };
  });
}

// Which kit a room quotes: an explicit per-room choice ('none' = nothing),
// else the MDF / IDF default.
export function roomKitSku(model, room, kind) {
  const m = normalizePropertyModel(model);
  const chosen = m.kits.roomKitSku?.[room.id];
  if (chosen === 'none') return '';
  if (chosen) return chosen;
  if (kind === 'townhome') return '';
  const eff = effectiveKitSkus(m); // the FTTU variants under XGS-PON (Phase 8)
  return kind === 'mdf' ? eff.mdfSku : eff.idfSku;
}

// Kit lines (Phase 3) followed by structured-cabling runs (Phase 4). ctx
// may carry the quote's `inputs` so in-unit drops follow the Wi-Fi coverage
// rules.
export function computeInfrastructureLines(value, products = [], ctx = {}) {
  // Kits (Phase 3), the PON gear when the design is XGS-PON (Phase 8), then
  // the structured-cabling runs (Phase 4).
  return [...computeKitLines(value, products), ...computePonLines(value, products, ctx), ...computeCablingLines(value, products, ctx)];
}

export function computeKitLines(value, products = []) {
  const model = normalizePropertyModel(value);
  const totals = propertyTotals(model);
  const bySku = productsBySku(products);
  const wanted = new Map(); // sku → { qty, notes: Set }
  const add = (sku, qty, note) => {
    if (!sku || qty <= 0) return;
    const w = wanted.get(sku) ?? { qty: 0, notes: new Set() };
    w.qty += qty;
    if (note) w.notes.add(note);
    wanted.set(sku, w);
  };

  for (const { room, kind } of roomRoles(model)) {
    add(roomKitSku(model, room, kind), 1, kind === 'mdf' ? 'MDF' : 'IDF');
  }
  if (model.kits.mediaPanelPerUnit && totals.units > 0) {
    add(model.kits.mediaPanelSku, totals.units, 'one per unit');
  }

  return [...wanted.entries()].map(([sku, w]) => {
    const p = bySku.get(sku);
    if (!p) {
      return { sku, description: `${sku} — not in this catalog`, category: 'Rack', qty: w.qty, cost: 0, price: 0, missing: true, note: [...w.notes].join(', ') };
    }
    return {
      sku: p.sku,
      description: p.desc,
      category: p.category,
      qty: w.qty,
      cost: n0(p.cost),
      price: n0(p.price),
      parts: p.componentsResolved ?? null,
      note: [...w.notes].join(', '),
    };
  });
}

// Installation Technician hours for the kits: per room by role, per unit
// for media panels (the takeoff's 16 h MDF, 8 h IDF, 1 h per media panel).
export function infrastructureLaborHours(value, ctx = {}) {
  const model = normalizePropertyModel(value);
  const totals = propertyTotals(model);
  const h = model.kits.installHours;
  let hours = ponLaborHours(model, ctx)['install-tech']; // Phase 8: ONT provisioning + PON activation
  for (const { room, kind } of roomRoles(model)) {
    if (!roomKitSku(model, room, kind)) continue;
    hours += kind === 'mdf' ? h.mdf : h.idf;
  }
  if (model.kits.mediaPanelPerUnit && model.kits.mediaPanelSku) hours += totals.units * h.mediaPanel;
  return { 'install-tech': hours };
}
