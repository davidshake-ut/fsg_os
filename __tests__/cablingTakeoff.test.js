import { describe, it, expect } from 'vitest';
import { CABLING_RUN_TYPES, CABLING_RUN_KEYS, CABLING_DEFAULTS } from '../lib/cablingRuns';
import { deriveCablingRuns, computeCablingLines, cablingTotals, unitApCount } from '../lib/cablingTakeoff';
import { computeInfrastructureLines } from '../lib/infrastructureLines';
import { normalizePropertyModel } from '../lib/propertyModel';
import { mergeProducts } from '../lib/mergeProducts';
import { rollUpAssemblies } from '../lib/assemblies';

// Two buildings + townhomes: B1's two floors share the MDF; B2 has two
// closets (a chain of one link); B2's second floor was unassigned in the
// Wi-Fi tests — here it gets its own room so the chain rule has work to do.
const model = () => ({
  buildings: [{ id: 'b1', name: 'Building 1' }, { id: 'b2', name: 'Building 2' }, { id: 'th', name: 'Townhomes' }],
  levels: [
    { id: 'l1', buildingId: 'b1', name: 'Level 1', roomId: 'mdf' },
    { id: 'l2', buildingId: 'b1', name: 'Level 2', roomId: 'mdf' },
    { id: 'l3', buildingId: 'b2', name: 'Level 1', roomId: 'idf' },
    { id: 'l4', buildingId: 'b2', name: 'Level 2', roomId: 'idf2' },
    { id: 'lt', buildingId: 'th', name: 'Townhomes', roomId: 'thr' },
  ],
  rooms: [
    { id: 'mdf', name: 'B1 MDF', isMdf: true },
    { id: 'idf', name: 'B2 IDF', isMdf: false },
    { id: 'idf2', name: 'B2 IDF 2', isMdf: false },
    { id: 'thr', name: 'TH', isMdf: false },
  ],
  unitTypes: [
    { id: 'u1', code: 'A1', bedrooms: 1, kind: 'apartment', sqft: 600, counts: { l1: 20, l2: 3 } },
    { id: 'u2', code: 'C1', bedrooms: 3, kind: 'apartment', sqft: 1300, counts: { l1: 3, l3: 40 } },
    { id: 'u3', code: 'TH1', bedrooms: 3, kind: 'townhome', sqft: 1600, counts: { lt: 4 } },
    { id: 'u4', code: 'B9', bedrooms: 2, kind: 'apartment', sqft: 900, counts: { l4: 2 } },
  ],
  amenityLocations: [{ id: 'a1', name: 'Lounge', qty: 2 }, { id: 'a2', name: 'Gym', qty: 1 }],
  outdoorLocations: [{ id: 'o1', name: 'Pool', qty: 2 }],
  otherDrops: [{ id: 'd1', name: 'Elevators', qty: 5, included: false }, { id: 'd2', name: 'Printers', qty: 2, included: true }],
  notes: '',
});
const products = rollUpAssemblies(mergeProducts([]));

describe('run-type registry', () => {
  it('lists eight runs with unique keys and seeded Cabling SKUs', () => {
    expect(CABLING_RUN_TYPES).toHaveLength(8);
    expect(new Set(CABLING_RUN_KEYS).size).toBe(8);
    const skus = new Set(products.filter((p) => p.category === 'Cabling').map((p) => p.sku));
    for (const t of CABLING_RUN_TYPES) expect(skus.has(t.defaultSku)).toBe(true);
    expect(CABLING_DEFAULTS).toEqual({ enabled: true, runs: {} });
  });

  it('normalizes cabling settings: known keys only, blank qty = derived, enabled only when false', () => {
    const m = normalizePropertyModel({
      cabling: { enabled: 'yes', runs: { backbone: { qty: '6', sku: ' X ' }, unitFiber: { enabled: false, qty: '' }, bogus: { qty: 1 }, idfLinks: {} } },
    });
    expect(m.cabling).toEqual({ enabled: true, runs: { backbone: { sku: 'X', qty: 6 }, unitFiber: { enabled: false } } });
    expect(normalizePropertyModel({ cabling: { enabled: false } }).cabling).toEqual({ enabled: false, runs: {} });
  });
});

describe('deriveCablingRuns', () => {
  it('derives every run from the property', () => {
    const r = deriveCablingRuns(model());
    expect(r.streetToMdf.derived).toBe(1);
    expect(r.backbone.derived).toBe(3); // three buildings with a telecom room
    expect(r.idfLinks.derived).toBe(1); // B2's two closets chained; B1 and TH have one room each
    expect(r.unitCat6.derived).toBe(72);
    expect(r.unitFiber.derived).toBe(72);
    expect(r.inUnitCat6.derived).toBe(72); // one AP per unit without Wi-Fi coverage rules
    expect(r.commonDrops.derived).toBe(3 + 2 + 2); // amenity + outdoor + included other drops
    expect(r.townhomeDrops.derived).toBe(4);
    for (const key of CABLING_RUN_KEYS) {
      expect(r[key]).toMatchObject({ entered: false, enabled: true, qty: r[key].derived });
      expect(r[key].sku).toMatch(/^CBL-/);
    }
  });

  it('in-unit drops follow the Wi-Fi coverage rules when the quote designs from the property', () => {
    const inputs = { wifiTakeoff: { enabled: true, apsPerClass: { 3: 2, th: 2 } } };
    expect(unitApCount(model(), inputs)).toBe(72 + 43 + 4);
    expect(deriveCablingRuns(model(), { inputs }).inUnitCat6.derived).toBe(119);
    expect(deriveCablingRuns(model(), { inputs: { wifiTakeoff: { enabled: false } } }).inUnitCat6.derived).toBe(72);
    expect(deriveCablingRuns(model(), { unitAPs: 200 }).inUnitCat6.derived).toBe(200);
  });

  it('entered counts, disabled runs, and SKU choices pass through', () => {
    const m = { ...model(), cabling: { enabled: true, runs: { backbone: { qty: 6 }, unitFiber: { enabled: false }, idfLinks: { sku: 'B2B-FIBER' } } } };
    const r = deriveCablingRuns(m);
    expect(r.backbone).toMatchObject({ derived: 3, qty: 6, entered: true });
    expect(r.unitFiber).toMatchObject({ enabled: false, qty: 72 });
    expect(r.idfLinks.sku).toBe('B2B-FIBER');
  });

  it('an empty property derives zero runs', () => {
    const r = deriveCablingRuns(undefined);
    expect(Object.values(r).every((x) => x.derived === 0)).toBe(true);
  });
});

describe('computeCablingLines', () => {
  it('prices enabled runs with a quantity as Cabling service lines', () => {
    const lines = computeCablingLines(model(), products);
    expect(lines).toHaveLength(8);
    expect(lines.every((l) => l.isService && l.category === 'Cabling' && !l.missing)).toBe(true);
    const unit = lines.find((l) => l.runKey === 'unitCat6');
    expect(unit).toMatchObject({ sku: 'CBL-UNIT-CAT6', qty: 72, cost: 125, price: 275, note: 'IDF to unit — Cat6 · derived' });
    const totals = cablingTotals(lines);
    expect(totals.cost).toBe(7500 + 3 * 3000 + 1 * 125 + 72 * 125 + 72 * 125 + 72 * 90 + 7 * 275 + 4 * 275);
    expect(totals.runs).toBe(1 + 3 + 1 + 72 + 72 + 72 + 7 + 4);
  });

  it('drops disabled or zero runs, flags an unknown SKU, and quotes nothing when cabling is off', () => {
    const m = { ...model(), cabling: { enabled: true, runs: { unitFiber: { enabled: false }, townhomeDrops: { qty: 0 }, backbone: { sku: 'NOPE' } } } };
    const lines = computeCablingLines(m, products);
    expect(lines.map((l) => l.runKey)).not.toContain('unitFiber');
    expect(lines.map((l) => l.runKey)).not.toContain('townhomeDrops');
    const bb = lines.find((l) => l.runKey === 'backbone');
    expect(bb).toMatchObject({ missing: true, cost: 0, price: 0, sku: 'NOPE' });
    expect(computeCablingLines({ ...model(), cabling: { enabled: false } }, products)).toEqual([]);
  });

  it('Digital Infrastructure lines = kits first, then cabling', () => {
    const lines = computeInfrastructureLines(model(), products, {});
    const kitIdx = lines.findIndex((l) => l.sku === 'KIT-IDF-12U');
    const runIdx = lines.findIndex((l) => l.runKey === 'unitCat6');
    expect(kitIdx).toBeGreaterThanOrEqual(0);
    expect(runIdx).toBeGreaterThan(kitIdx);
    expect(lines.find((l) => l.sku === 'KIT-MEDIA-PANEL').qty).toBe(72);
  });
});
