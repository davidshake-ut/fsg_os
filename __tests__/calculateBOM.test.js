import { describe, it, expect } from 'vitest';
import { calculateBOM } from '../lib/calculateBOM';
import { DEFAULT_INPUTS } from '../lib/defaults';
import { BASE_PRODUCTS } from '../lib/catalog';

// Helpers ------------------------------------------------------------------
const run = (overrides = {}, products = BASE_PRODUCTS) =>
  calculateBOM({ ...DEFAULT_INPUTS, ...overrides }, {}, {}, products);

const qtyOf = (bom, sku) =>
  bom.items.filter((i) => i.sku === sku).reduce((s, i) => s + i.qty, 0);

const hasItem = (bom, sku) => bom.items.some((i) => i.sku === sku);

const switchQty = (bom) =>
  bom.items
    .filter((i) => i.category === 'Switch' || i.category === 'Aggregate Switch')
    .reduce((s, i) => s + i.qty, 0);

// Tests --------------------------------------------------------------------
describe('100-room / 2-IDF / Wi-Fi 6 hallway (defaults)', () => {
  const bom = run();

  it('derives guest-room AP count from room/ratio', () => {
    expect(bom.guestRoomAPs).toBe(50); // ceil(100/2)
    expect(bom.totalAPs).toBe(50);
  });

  it('uses Wi-Fi 6 ceiling APs + matching subscription', () => {
    expect(qtyOf(bom, 'XV2-21X')).toBe(50);
    expect(qtyOf(bom, 'MSX-SUB-XV2-21X-5')).toBe(50);
    expect(hasItem(bom, 'XV3-21X')).toBe(false);
  });

  it('always adds the gateway block', () => {
    expect(qtyOf(bom, 'NSE3000')).toBe(1);
    expect(qtyOf(bom, 'PSI5-1500RT120')).toBe(1);
    expect(qtyOf(bom, 'SFP-1G-SX')).toBe(4);
    expect(qtyOf(bom, 'CAT6-3ft-RED')).toBe(4);
  });

  it('sizes two 48-port IDF switches and a fiber aggregate', () => {
    expect(bom.idfSwitches48).toBe(2);
    expect(bom.idfSwitches24).toBe(0);
    expect(bom.totalIdfSwitches).toBe(2);
    expect(bom.needsAggSwitch).toBe(true);
    expect(qtyOf(bom, 'MXEX3024xFxA01')).toBe(1);
    expect(qtyOf(bom, 'SFP-10G-SR')).toBe(4); // 2 links * 2 ends
    expect(qtyOf(bom, 'GS-LC2-05-10G')).toBe(2);
  });
});

describe('Wi-Fi 7', () => {
  const bom = run({ wifiGeneration: 'wifi7' });

  it('swaps APs to the XV3 series', () => {
    expect(qtyOf(bom, 'XV3-21X')).toBe(50);
    expect(hasItem(bom, 'XV2-21X')).toBe(false);
  });

  it('forces hallway even if in-room requested (fix #8)', () => {
    const inroom = run({ wifiGeneration: 'wifi7', deploymentType: 'inroom' });
    expect(hasItem(inroom, 'XV3-22H')).toBe(false); // no wallplate
    expect(qtyOf(inroom, 'XV3-21X')).toBe(50); // ceiling instead
  });
});

describe('In-room deployment (Wi-Fi 6)', () => {
  const bom = run({ deploymentType: 'inroom' });
  it('adds wallplate APs, flush mounts and 3" cables', () => {
    expect(qtyOf(bom, 'XV2-22H')).toBe(50);
    expect(qtyOf(bom, 'PL-WALLMNTB-WW')).toBe(50);
    expect(qtyOf(bom, 'CAT6-3in-BLACK')).toBe(50);
  });
});

describe('Single-IDF deployment (fix #1 regression)', () => {
  const bom = run({ numberOfRooms: 10, numberOfIDFs: 1 });

  it('produces exactly ONE switch and no aggregate', () => {
    expect(bom.totalIdfSwitches).toBe(1);
    expect(bom.needsAggSwitch).toBe(false);
    expect(switchQty(bom)).toBe(1); // not 2
    expect(hasItem(bom, 'MXEX3024xFxA01')).toBe(false);
  });

  it('labels the single switch as the core', () => {
    const sw = bom.items.find((i) => i.sku === 'MX-EX2028PxA-U');
    expect(sw.note).toMatch(/single-IDF/i);
  });
});

describe('High-density IDF prefers 48-port switches (review fix)', () => {
  const bom = run({ numberOfRooms: 200, numberOfIDFs: 1 });

  it('packs >46 ports onto 48-port switches instead of fanning out 24s', () => {
    expect(bom.totalPoEPorts).toBeGreaterThan(46);
    expect(bom.idfSwitches48).toBeGreaterThanOrEqual(1);
    // At most one 24-port switch remains (the small remainder); no 24-port fan-out.
    expect(bom.idfSwitches24).toBeLessThanOrEqual(1);
    // Switch capacity still covers every PoE port.
    expect(bom.idfSwitches48 * 46 + bom.idfSwitches24 * 22).toBeGreaterThanOrEqual(
      bom.totalPoEPorts,
    );
  });
});

describe('Aggregate switch type', () => {
  it('multi-IDF fiber adds SFP modules', () => {
    const bom = run({ aggSwitchType: 'fiber' });
    expect(hasItem(bom, 'SFP-10G-SR')).toBe(true);
    expect(hasItem(bom, 'MXEX3024xFxA01')).toBe(true);
  });

  it('multi-IDF copper uses EX2052P agg and no fiber modules', () => {
    const bom = run({ aggSwitchType: 'copper' });
    expect(hasItem(bom, 'SFP-10G-SR')).toBe(false);
    expect(hasItem(bom, 'MXEX3024xFxA01')).toBe(false);
    expect(hasItem(bom, 'MXEX2052GxPA01')).toBe(true);
  });
});

describe('Spare APs', () => {
  const bom = run({ spareAPs: true });
  it('adds 5% (min 1) spares NOT counted in totalAPs', () => {
    const spare = bom.items.find((i) => i.note === 'Spare APs (5%)');
    expect(spare.qty).toBe(3); // ceil(50 * 0.05) = 3
    expect(bom.totalAPs).toBe(50); // spares excluded
  });
});

describe('Miscellaneous hardware percentage', () => {
  it('miscHwPercent > 0 → exact % of running hardware subtotal', () => {
    const bom = run({ miscHwPercent: 10 });
    const misc = bom.items.find((i) => i.sku === 'MISC-HW');
    const subtotalBefore = bom.items
      .filter((i) => i.sku !== 'MISC-HW')
      .reduce((s, i) => s + i.totalPrice, 0);
    expect(misc.totalPrice).toBeCloseTo(subtotalBefore * 0.1, 4);
  });

  it('miscHwPercent = 0 → fixed catalog MISC-HW line', () => {
    const bom = run({ miscHwPercent: 0 });
    const misc = bom.items.find((i) => i.sku === 'MISC-HW');
    expect(misc.unitPrice).toBe(650);
  });
});

describe('Building-to-building', () => {
  it('none → no B2B line', () => {
    expect(hasItem(run({ b2bConnectionType: 'none' }), 'B2B-FIBER')).toBe(false);
  });
  it('fiber → B2B-FIBER with requested qty', () => {
    const bom = run({ b2bConnectionType: 'fiber', b2bConnectionQty: 2 });
    expect(qtyOf(bom, 'B2B-FIBER')).toBe(2);
  });
});

describe('Structured cabling', () => {
  it('cat6Required false → no drops', () => {
    const bom = run({ cat6Required: false });
    expect(hasItem(bom, 'CAT6-DROP')).toBe(false);
  });
  it('cat6Required + drops → CAT6 drop lines', () => {
    const bom = run({ cat6Required: true, cat6Drops: 20 });
    expect(qtyOf(bom, 'CAT6-DROP')).toBe(20);
  });
});

describe('Financial totals', () => {
  const bom = run();
  it('shipping is 7% of hardware price only', () => {
    expect(bom.shippingPrice).toBeCloseTo(bom.totalHardwarePrice * 0.07, 6);
    expect(bom.shippingCost).toBeCloseTo(bom.totalHardwareCost * 0.07, 6);
  });
  it('grand totals sum hardware + services + shipping', () => {
    expect(bom.grandTotalPrice).toBeCloseTo(
      bom.totalHardwarePrice + bom.totalServicesPrice + bom.shippingPrice,
      6
    );
  });
  it('shipping toggle off → no shipping; custom percent is applied', () => {
    const off = run({ includeShipping: false });
    expect(off.shippingPrice).toBe(0);
    expect(off.shippingPercent).toBe(0);
    expect(off.grandTotalPrice).toBeCloseTo(off.totalHardwarePrice, 6);
    const custom = run({ includeShipping: true, shippingPercent: 10 });
    expect(custom.shippingPercent).toBe(10);
    expect(custom.shippingPrice).toBeCloseTo(custom.totalHardwarePrice * 0.1, 6);
  });
  it('emits hardware only — labor moved to the project rate card', () => {
    // The engine no longer generates professional services; all labor now comes
    // from lib/calculateLabor.js (see calculateLabor.test.js).
    expect(bom.serviceItems).toEqual([]);
    expect(bom.totalServicesPrice).toBe(0);
    expect(bom.grandTotalPrice).toBeCloseTo(bom.totalHardwarePrice + bom.shippingPrice, 6);
  });
});

describe('Robustness', () => {
  it('numberOfIDFs = 0 does not produce Infinity (fix #4)', () => {
    const bom = run({ numberOfIDFs: 0 });
    expect(Number.isFinite(bom.grandTotalPrice)).toBe(true);
    expect(bom.grandTotalPrice).toBeGreaterThan(0);
  });

  it('missing core product is skipped, not thrown (fix #3)', () => {
    const without = BASE_PRODUCTS.filter((p) => p.sku !== 'NSE3000');
    expect(() => run({}, without)).not.toThrow();
    const bom = run({}, without);
    expect(hasItem(bom, 'NSE3000')).toBe(false);
  });
});

describe('custom line items', () => {
  it('appends custom lines (segment-tagged) and rolls them into totals', () => {
    const base = calculateBOM(DEFAULT_INPUTS, {}, {}, BASE_PRODUCTS, []);
    const withCustom = calculateBOM(DEFAULT_INPUTS, {}, {}, BASE_PRODUCTS, [
      {
        id: 'x1',
        system: 'wifi',
        segment: 'Accessories',
        sku: 'CUST-1',
        description: 'On-site rack build',
        qty: 2,
        cost: 100,
        price: 250,
      },
    ]);
    const line = withCustom.items.find((i) => i.sku === 'CUST-1');
    expect(line).toBeTruthy();
    expect(line.isCustomLine).toBe(true);
    expect(line.segment).toBe('Accessories');
    expect(line.totalPrice).toBe(500);
    expect(line.totalCost).toBe(200);
    expect(withCustom.totalHardwarePrice).toBeCloseTo(base.totalHardwarePrice + 500, 2);
    expect(withCustom.grandTotalPrice).toBeGreaterThan(base.grandTotalPrice);
  });
});

describe('camera-only quote (includeWifi = false)', () => {
  it('zeroes Wi-Fi equipment and services', () => {
    const bom = calculateBOM({ ...DEFAULT_INPUTS, includeWifi: false }, {}, {}, BASE_PRODUCTS);
    expect(bom.items).toEqual([]);
    expect(bom.serviceItems).toEqual([]);
    expect(bom.totalAPs).toBe(0);
    expect(bom.totalHardwarePrice).toBe(0);
    expect(bom.grandTotalPrice).toBe(0);
  });

  it('still keeps custom Wi-Fi lines the user added', () => {
    const bom = calculateBOM({ ...DEFAULT_INPUTS, includeWifi: false }, {}, {}, BASE_PRODUCTS, [
      { id: 'c1', segment: 'Accessories', sku: 'X', description: 'Misc', qty: 1, cost: 10, price: 20 },
    ]);
    expect(bom.items).toHaveLength(1);
    expect(bom.items[0].isCustomLine).toBe(true);
    expect(bom.totalHardwarePrice).toBe(20);
  });
});

describe('tag-based equipment selection (0061)', () => {
  // A catalog where David has tagged mount/quality/ports/watts/licenses.
  const TAGGED = [
    ...BASE_PRODUCTS,
    { sku: 'R350', desc: 'Ruckus R350', category: 'Access Point', technology: 'managed_wifi', mount_type: 'ceiling', quality_tier: 'better', poe_watts: 15, license_sku_1yr: 'LIC-R350-1', license_sku_5yr: 'LIC-R350-5', cost: 100, price: 200 },
    { sku: 'R560', desc: 'Ruckus R560', category: 'Access Point', technology: 'managed_wifi', mount_type: 'ceiling', quality_tier: 'best', poe_watts: 25, license_sku_5yr: 'LIC-R560-5', cost: 300, price: 500 },
    { sku: 'H350', desc: 'Ruckus H350 wall AP', category: 'Access Point', technology: 'managed_wifi', mount_type: 'wall', quality_tier: 'better', cost: 80, price: 160 },
    { sku: 'LIC-R350-1', desc: 'R350 1yr license', category: 'License', technology: 'managed_wifi', cost: 5, price: 10 },
    { sku: 'LIC-R350-5', desc: 'R350 5yr license', category: 'License', technology: 'managed_wifi', cost: 20, price: 40 },
    { sku: 'LIC-R560-5', desc: 'R560 5yr license', category: 'License', technology: 'managed_wifi', cost: 30, price: 60 },
    { sku: 'ICX-24P', desc: 'Ruckus ICX 24-port', category: 'Switch', technology: 'managed_wifi', quality_tier: 'better', port_count: 24, poe_budget_watts: 370, cost: 500, price: 900 },
    { sku: 'ICX-48P', desc: 'Ruckus ICX 48-port', category: 'Switch', technology: 'managed_wifi', quality_tier: 'better', port_count: 48, poe_budget_watts: 740, cost: 900, price: 1500 },
  ];

  it('ceiling + better picks the tagged AP with its 5yr license (default term)', () => {
    const bom = run({ deploymentType: 'ceiling', wifiQuality: 'better' }, TAGGED);
    expect(qtyOf(bom, 'R350')).toBe(50);
    expect(qtyOf(bom, 'LIC-R350-5')).toBe(50);
    expect(hasItem(bom, 'XV2-21X')).toBe(false);
    expect(hasItem(bom, 'MSX-SUB-XV2-21X-5')).toBe(false); // no legacy sub on tagged picks
  });

  it('license term selects the matching linked SKU; unlinked terms ship hardware only', () => {
    const oneYr = run({ wifiQuality: 'better', licenseTerm: 1 }, TAGGED);
    expect(qtyOf(oneYr, 'LIC-R350-1')).toBe(50);
    expect(hasItem(oneYr, 'LIC-R350-5')).toBe(false);
    const threeYr = run({ wifiQuality: 'better', licenseTerm: 3 }, TAGGED);
    expect(hasItem(threeYr, 'LIC-R350-1')).toBe(false);
    expect(hasItem(threeYr, 'LIC-R350-5')).toBe(false);
  });

  it('quality best swaps to the best-tier AP', () => {
    const bom = run({ wifiQuality: 'best' }, TAGGED);
    expect(qtyOf(bom, 'R560')).toBe(50);
    expect(hasItem(bom, 'R350')).toBe(false);
  });

  it('wall deployment uses the wall-tagged AP without Cambium wallplate accessories', () => {
    const bom = run({ deploymentType: 'wall', wifiQuality: 'better' }, TAGGED);
    expect(qtyOf(bom, 'H350')).toBe(50);
    expect(hasItem(bom, 'PL-WALLMNTB-WW')).toBe(false);
    expect(hasItem(bom, 'XV2-22H')).toBe(false);
  });

  it('a tagged wall AP is exempt from the Wi-Fi 7 forced-ceiling rule', () => {
    const bom = run({ deploymentType: 'wall', wifiQuality: 'better', wifiGeneration: 'wifi7' }, TAGGED);
    expect(qtyOf(bom, 'H350')).toBe(50);
    expect(hasItem(bom, 'XV3-21X')).toBe(false);
  });

  it('legacy hallway/inroom input values map to ceiling/wall', () => {
    const hallway = run({ deploymentType: 'hallway', wifiQuality: 'better' }, TAGGED);
    expect(qtyOf(hallway, 'R350')).toBe(50); // hallway ≙ ceiling
    const inroom = run({ deploymentType: 'inroom', wifiQuality: 'better' }, TAGGED);
    expect(qtyOf(inroom, 'H350')).toBe(50); // inroom ≙ wall
  });

  it('tier-tagged switches replace the Cambium edge switches by port class', () => {
    const bom = run({ wifiQuality: 'better' }, TAGGED);
    // 50 PoE ports / 2 IDFs = 25 per IDF → one 48-class each.
    expect(qtyOf(bom, 'ICX-48P')).toBe(2);
    expect(hasItem(bom, 'MXEX2052GxPA01')).toBe(false);
    expect(hasItem(bom, 'MX-EX2028PxA-U')).toBe(false);
  });

  it('quality tier without a tagged switch match falls back to legacy switches', () => {
    const bom = run({ wifiQuality: 'best' }, TAGGED); // switches only tagged "better"
    expect(hasItem(bom, 'ICX-48P')).toBe(false);
    expect(qtyOf(bom, 'MXEX2052GxPA01')).toBe(2);
  });

  it('PoE power budget adds switches when wattage binds before ports', () => {
    // Best AP draws 25W; give the best-tier switches small budgets so power,
    // not port count, limits how many APs each can carry: floor(250/25)=10.
    const POWER = [
      ...TAGGED,
      { sku: 'ICX-24P-B', desc: 'Best 24-port', category: 'Switch', technology: 'managed_wifi', quality_tier: 'best', port_count: 24, poe_budget_watts: 250, cost: 700, price: 1200 },
      { sku: 'ICX-48P-B', desc: 'Best 48-port', category: 'Switch', technology: 'managed_wifi', quality_tier: 'best', port_count: 48, poe_budget_watts: 250, cost: 1100, price: 1900 },
    ];
    const bom = run({ wifiQuality: 'best' }, POWER);
    // 25 ports per IDF at 10-AP capacity → 2× 48-class + 1× 24-class per IDF.
    expect(bom.idfSwitches48).toBe(4);
    expect(bom.idfSwitches24).toBe(2);
    expect(qtyOf(bom, 'ICX-48P-B')).toBe(4);
    expect(qtyOf(bom, 'ICX-24P-B')).toBe(2);
  });

  it('an untagged catalog is byte-identical to the legacy engine', () => {
    const tagged = run({ wifiQuality: 'best', licenseTerm: 3 }); // BASE_PRODUCTS, no tags
    const legacy = run();
    expect(tagged.items.map((i) => [i.sku, i.qty])).toEqual(legacy.items.map((i) => [i.sku, i.qty]));
  });
});

describe('catalogSnapshot (locked-quote pricing freeze)', () => {
  // A locked quote (sent/accepted/declined) passes its own frozen snapshot so
  // a later catalog/discount change never silently reprices it.
  it('a snapshot entry overrides the live catalog for that SKU', () => {
    const live = run(); // live pricing, no snapshot
    const liveAp = live.items.find((i) => i.sku === 'XV2-21X');
    expect(liveAp.unitCost).toBeCloseTo(98.94, 2);

    const snapshot = { 'XV2-21X': { sku: 'XV2-21X', desc: 'Frozen AP', category: 'Access Point', cost: 40, price: 60 } };
    const frozen = calculateBOM(DEFAULT_INPUTS, {}, {}, BASE_PRODUCTS, [], snapshot);
    const frozenAp = frozen.items.find((i) => i.sku === 'XV2-21X');
    expect(frozenAp.unitCost).toBe(40);
    expect(frozenAp.unitPrice).toBe(60);
  });

  it('SKUs not in the snapshot still fall back to the live catalog', () => {
    const snapshot = { 'XV2-21X': { sku: 'XV2-21X', desc: 'Frozen AP', category: 'Access Point', cost: 40, price: 60 } };
    const frozen = calculateBOM(DEFAULT_INPUTS, {}, {}, BASE_PRODUCTS, [], snapshot);
    const gateway = frozen.items.find((i) => i.sku === 'NSE3000');
    expect(gateway.unitCost).toBeCloseTo(1295.0, 2); // live BASE_PRODUCTS price, untouched
  });

  it('a project-level priceOverride still wins over a frozen snapshot entry', () => {
    const snapshot = { 'XV2-21X': { sku: 'XV2-21X', desc: 'Frozen AP', category: 'Access Point', cost: 40, price: 60 } };
    const frozen = calculateBOM(
      DEFAULT_INPUTS,
      { 'XV2-21X': { cost: 5, price: 10 } },
      {},
      BASE_PRODUCTS,
      [],
      snapshot
    );
    const ap = frozen.items.find((i) => i.sku === 'XV2-21X');
    expect(ap.unitCost).toBe(5);
    expect(ap.unitPrice).toBe(10);
  });

  it('no snapshot (draft/new revision) reads live catalog pricing', () => {
    const bom = calculateBOM(DEFAULT_INPUTS, {}, {}, BASE_PRODUCTS, [], null);
    const ap = bom.items.find((i) => i.sku === 'XV2-21X');
    expect(ap.unitCost).toBeCloseTo(98.94, 2);
  });
});
