import { describe, it, expect } from 'vitest';
import { MUZE } from './fixtures/muze';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';
import { parseDelimited } from '../lib/csv';
import {
  guessUnitScheduleMapping,
  parseUnitSchedule,
  propertyFromImport,
  normalizePropertyModel,
  propertyTotals,
  orderedLevels,
} from '../lib/propertyModel';
import { buildWifiTakeoff } from '../lib/wifiTakeoff';
import { calculateBOM } from '../lib/calculateBOM';
import { DEFAULT_INPUTS } from '../lib/defaults';
import { BASE_PRODUCTS } from '../lib/catalog';
import { mergeProducts } from '../lib/mergeProducts';
import { rollUpAssemblies } from '../lib/assemblies';
import { computeInfrastructureLines, infrastructureLaborHours } from '../lib/infrastructureLines';

// The Muze property as the Builder would hold it after the Phase 1 import,
// plus the takeoff's named lists (14 amenity rooms listed, 9 outdoor APs).
function importMuzeProperty() {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  const model = normalizePropertyModel(propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows))));
  return {
    ...model,
    amenityLocations: MUZE.takeoff.amenityLocations.map((name, i) => ({ id: `am${i}`, name, qty: 1 })),
    outdoorLocations: MUZE.takeoff.outdoorLocations.map((name, i) => ({
      id: `out${i}`,
      name,
      qty: Number((/X\s?(\d+)/i.exec(name) || [])[1] || 1),
    })),
  };
}

// The Ruckus gear the workbook prices, tagged the way the catalog (0061)
// expects: AP draw 22 W; 8 / 24 / 48-port PoE budgets 124 / 370 / 740 W.
const MUZE_RUCKUS = [
  { sku: 'R650', desc: 'Ruckus R650 Wi-Fi 6 AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'Ruckus', cost: 418.98, price: 1305, mount_type: 'ceiling', quality_tier: 'better', poe_watts: 22 },
  { sku: 'ICX-8100-C08PF', desc: 'ICX 8100 8-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 437.69, price: 1980, quality_tier: 'better', port_count: 8, poe_budget_watts: 124 },
  { sku: 'ICX-8100-24P', desc: 'ICX 8100 24-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 739.61, price: 4015, quality_tier: 'better', port_count: 24, poe_budget_watts: 370 },
  { sku: 'ICX-8100-48PFX', desc: 'ICX 8100 48-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 1458.95, price: 7700, quality_tier: 'better', port_count: 48, poe_budget_watts: 740 },
  { sku: 'TPL-4PORT', desc: 'TP-Link 4-port unmanaged', category: 'Switch', technology: 'managed_wifi', vendor: 'TP-Link', cost: 100, price: 150 },
];

// Phase 0 of the complex-project Builder initiative (plan:
// C:\Users\david\.claude\plans\muze-to-builder.md). These tests prove the
// golden fixture reproduces every total in the Muze Apartments workbook
// using nothing but the workbook's own rules — so when later phases teach
// the Builder those rules, "matches the fixture" means "matches the quote
// David actually sent". The engine-parity block at the bottom is the
// roadmap; each phase converts its todo into a real assertion.

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const levelIds = MUZE.levels.map((l) => l.id);
const unitClass = (u) => (u.kind === 'townhome' ? 'th' : String(u.bedrooms));

const zeroByLevel = () => Object.fromEntries(levelIds.map((id) => [id, 0]));
const perLevel = (weight) => {
  const out = zeroByLevel();
  for (const u of MUZE.unitTypes) {
    for (const [lid, n] of Object.entries(u.countsByLevel)) out[lid] += n * weight(u);
  }
  return out;
};
const totalOf = (byLevel) => sum(Object.values(byLevel), (n) => n);

// ---------------------------------------------------------------------------
describe('Muze fixture — property takeoff (Unit Matrix → Equipment Takeoff)', () => {
  const { takeoff } = MUZE;

  it('the unit schedule totals 400 units and 598 beds', () => {
    expect(MUZE.unitTypes.length).toBeGreaterThan(40);
    expect(totalOf(perLevel(() => 1))).toBe(400);
    expect(totalOf(perLevel((u) => u.bedrooms))).toBe(598);
    expect(takeoff.totalUnits).toBe(400);
    expect(takeoff.totalBeds).toBe(598);
  });

  it('per-level unit counts match takeoff row 60 for all 20 building-levels', () => {
    expect(levelIds).toHaveLength(20);
    expect(perLevel(() => 1)).toEqual(takeoff.unitsByLevel);
  });

  it('baseline coverage (1 AP per unit) yields 400 APs, per level as row 68', () => {
    const rule = takeoff.coverage.baseline.apsPerUnit;
    const aps = perLevel((u) => rule[unitClass(u)]);
    expect(aps).toEqual(takeoff.coverage.baseline.apsByLevel);
    expect(totalOf(aps)).toBe(400);
    expect(takeoff.coverage.baseline.totalAPs).toBe(400);
  });

  it('extended coverage (3-bedroom and townhomes ×2) yields 438 APs, per level as row 83', () => {
    const rule = takeoff.coverage.extended.apsPerUnit;
    expect(rule).toEqual({ 1: 1, 2: 1, 3: 2, th: 2 });
    const aps = perLevel((u) => rule[unitClass(u)]);
    expect(aps).toEqual(takeoff.coverage.extended.apsByLevel);
    expect(totalOf(aps)).toBe(438);
  });

  it('the 20% port overhead rounds up per level (rows 69 and 84)', () => {
    for (const plan of ['baseline', 'extended']) {
      const c = takeoff.coverage[plan];
      for (const lid of levelIds) {
        // Round away float noise (20 × 1.2 must be exactly 24 before ceil).
        const ports = Math.ceil(Math.round(c.apsByLevel[lid] * takeoff.portOverheadFactor * 1e9) / 1e9);
        expect(c.portsByLevel[lid]).toBe(ports);
      }
    }
  });

  it('38 units get a second AP and therefore an in-unit switch (22 three-bedroom + 16 townhomes)', () => {
    const rule = takeoff.coverage.extended.apsPerUnit;
    const multi = totalOf(perLevel((u) => (rule[unitClass(u)] > 1 ? 1 : 0)));
    expect(multi).toBe(38);
    expect(MUZE.options[1].hardware[0].rows.find((r) => r.role === 'EXTRA BR SWITCH').qty).toBe(38);
  });

  it('switch plan: 20 × 8-port, 12 × 24-port, 11 × 48-port = 976 ports', () => {
    const plan = Object.values(takeoff.switchPlan);
    const s8 = sum(plan, (p) => p.s8);
    const s24 = sum(plan, (p) => p.s24);
    const s48 = sum(plan, (p) => p.s48);
    expect({ s8, s24, s48 }).toEqual({ s8: 20, s24: 12, s48: 11 });
    expect(s8 * 8 + s24 * 24 + s48 * 48).toBe(976);
    expect(takeoff.switchTotals).toEqual({ s8: 20, s24: 12, s48: 11, ports: 976 });
  });

  it('every IDF has at least as many switch ports as its extended-plan overhead count', () => {
    for (const lid of levelIds) {
      const p = takeoff.switchPlan[lid];
      const capacity = p.s8 * 8 + p.s24 * 24 + p.s48 * 48;
      expect(capacity).toBeGreaterThanOrEqual(takeoff.coverage.extended.portsByLevel[lid]);
    }
    // Townhomes: one 8-port switch each.
    expect(takeoff.switchPlan.th).toEqual({ s8: 16, s24: 0, s48: 0 });
  });

  it('named locations drive the outdoor (9) count; other drops are excluded — and the amenity count is typed, not counted (drift)', () => {
    // Workbook drift: 14 amenity rooms are listed, but the count the option
    // tabs consume (C103) is a typed 13. A computed model would quote 14.
    expect(takeoff.amenityLocations).toHaveLength(14);
    expect(takeoff.amenityAPs).toBe(13);
    // Outdoor entries carry "X2" multipliers: pool ×2, two courtyards ×2, pet spa ×2, EV.
    const outdoor = sum(takeoff.outdoorLocations, (name) => Number((/X\s?(\d+)/i.exec(name) || [])[1] || 1));
    expect(outdoor).toBe(9);
    expect(takeoff.outdoorAPs).toBe(9);
    expect(takeoff.otherDrops).toHaveLength(5);
    expect(takeoff.otherDropsIncluded).toBe(0);
    // The wiring "AMENITY & COMMON" row is exactly amenity + outdoor + other.
    for (const opt of MUZE.options) {
      const row = opt.wiring.rows.find((r) => r.run === 'AMENITY & COMMON');
      expect(row.qty).toBe(13 + 9 + 0);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Muze fixture — rack kits roll up from their components', () => {
  it.each(MUZE.kits)('$key ($label) = $expectedCost', (kit) => {
    expect(kit.components.length).toBeGreaterThan(5);
    expect(round2(sum(kit.components, (c) => c.qty * c.unitPrice))).toBeCloseTo(kit.expectedCost, 2);
  });

  it('the media panel without fiber terminations = 135.77', () => {
    const kit = MUZE.kits.find((k) => k.key === 'media-panel');
    const fiber = sum(kit.components.filter((c) => c.category === 'FIBER'), (c) => c.qty * c.unitPrice);
    expect(round2(kit.expectedCost - fiber)).toBeCloseTo(kit.expectedCostWithoutFiber, 2);
  });

  it('the option tabs price racks at the kit cost', () => {
    const idf = MUZE.kits.find((k) => k.key === 'idf-12u').expectedCost;
    const mdf = MUZE.kits.find((k) => k.key === 'mdf-22u').expectedCost;
    for (const opt of MUZE.options.slice(0, 3)) {
      for (const block of opt.hardware) {
        expect(block.rows.find((r) => r.role === 'IDF RACK')).toMatchObject({ qty: 18, eaCost: idf });
        expect(block.rows.find((r) => r.role === 'MDF RACK')).toMatchObject({ qty: 1, eaCost: mdf });
      }
    }
    const fttu = MUZE.options[3].hardware[0].rows;
    expect(fttu.find((r) => r.role === 'IDF FTTU RACK').eaCost).toBe(MUZE.kits.find((k) => k.key === 'idf-12u-fttu').expectedCost);
    expect(fttu.find((r) => r.role === 'MDF FTTU RACK').eaCost).toBe(MUZE.kits.find((k) => k.key === 'mdf-22u-fttu').expectedCost);
    // The media panel kit is the wiring table's per-unit drop cost.
    const panel = MUZE.kits.find((k) => k.key === 'media-panel').expectedCost;
    expect(MUZE.options[0].wiring.rows.find((r) => r.run === 'MEDIA PANEL')).toMatchObject({ qty: 400, dropCost: panel });
  });
});

// ---------------------------------------------------------------------------
// The workbook's pricing rules, written once. Phase 5 makes the Builder
// produce these same numbers from a pricing policy and a labor task table.
const hardwareTotals = (block) => {
  const ext = sum(block.rows, (r) => r.qty * r.eaCost);
  const misc = block.misc ? block.misc.pct * ext : 0;
  const price =
    sum(block.rows, (r) => r.qty * r.eaCost * (1 + r.markup)) +
    (block.misc ? misc * (1 + block.misc.markup) : 0);
  return { cost: ext + misc, price };
};
const laborTotals = (labor) => ({
  cost: sum(labor.rows, (r) => r.qty * r.hours * r.costRate),
  price: sum(labor.rows, (r) => r.qty * r.hours * r.billRate),
});
const wiringTotals = (wiring) => ({
  cost: sum(wiring.rows, (r) => r.qty * r.dropCost),
  price: sum(wiring.rows, (r) => r.qty * r.dropPrice),
});

describe('Muze fixture — each option tab reproduces from its rows', () => {
  for (const opt of MUZE.options) {
    describe(`${opt.key} · ${opt.sheet}`, () => {
      for (const block of opt.hardware) {
        it(`hardware (${block.vendor}): cost × (1 + markup by role) + 5% misc = ${block.expected.cost} → ${block.expected.price}`, () => {
          expect(block.misc).toEqual({ pct: 0.05, markup: 0.25 });
          const t = hardwareTotals(block);
          expect(t.cost).toBeCloseTo(block.expected.cost, 2);
          expect(t.price).toBeCloseTo(block.expected.price, 2);
        });
      }

      it(`labor task table = ${opt.labor.expected.cost} → ${opt.labor.expected.price}`, () => {
        const t = laborTotals(opt.labor);
        expect(t.cost).toBeCloseTo(opt.labor.expected.cost, 2);
        expect(t.price).toBeCloseTo(opt.labor.expected.price, 2);
        // The install/rack tasks bill at $90 → $150, engineering at $125 → $200.
        const rates = new Set(opt.labor.rows.map((r) => `${r.costRate}/${r.billRate}`));
        expect(rates).toEqual(new Set(['90/150', '125/200']));
      });

      it(`wiring run-type table = ${opt.wiring.expected.cost} → ${opt.wiring.expected.price}`, () => {
        const t = wiringTotals(opt.wiring);
        expect(t.cost).toBeCloseTo(opt.wiring.expected.cost, 2);
        expect(t.price).toBeCloseTo(opt.wiring.expected.price, 2);
      });

      it('summary = hardware + labor + wiring, margin = (price − cost) / price', () => {
        expect(opt.summaries).toHaveLength(opt.hardware.length);
        opt.summaries.forEach((s, i) => {
          const hw = hardwareTotals(opt.hardware[i]);
          const lb = laborTotals(opt.labor);
          const wr = wiringTotals(opt.wiring);
          const cost = hw.cost + lb.cost + wr.cost;
          const price = hw.price + lb.price + wr.price;
          expect(cost).toBeCloseTo(s.cost, 2);
          expect(price).toBeCloseTo(s.price, 2);
          expect(price - cost).toBeCloseTo(s.grossProfit, 2);
          expect((price - cost) / price).toBeCloseTo(s.margin, 5);
        });
      });
    });
  }

  it('the AP quantities follow the coverage plan: 400 baseline, 438 extended', () => {
    const [opt1, opt2, opt3, opt4] = MUZE.options;
    const apQty = (block, role) => block.rows.find((r) => r.role === role).qty;
    expect(apQty(opt1.hardware[0], 'AP')).toBe(400);
    expect(apQty(opt2.hardware[0], 'AP')).toBe(438);
    expect(apQty(opt3.hardware[0], 'APARTMENT AP')).toBe(438);
    expect(apQty(opt3.hardware[1], 'APARTMENT AP')).toBe(438);
    expect(apQty(opt4.hardware[0], 'APARTMENT AP')).toBe(438);
  });
});

// ---------------------------------------------------------------------------
describe('Muze fixture — the comparison matrix ties back to the option tabs', () => {
  const { comparison } = MUZE;
  const [opt1, opt2, opt3, opt4] = MUZE.options;
  // Column order on the sheet: OPT 1, OPT 2, OPT 3 Ruckus, OPT 3 Cambium, OPT 4.
  const mapping = [
    [opt1, 0],
    [opt2, 0],
    [opt3, 1],
    [opt3, 0],
    [opt4, 0],
  ];

  it('has five priced columns', () => {
    expect(comparison.columns).toHaveLength(5);
    expect(comparison.columns.map((c) => c.label)).toEqual([
      'OPT 1: WIFI 6 BASELINE',
      'OPT 2: WIFI 6 EXT COVERAGE',
      'OPT 3: EXT WIFI 7 w RUCKUS / RG NETS',
      'OPT 3: EXT WIFI 7 w CAMBIUM',
      'OPT 5: EXT HYBRID FTTU',
    ]);
  });

  it.each(mapping.map(([opt, i], col) => [col, opt.key, i]))(
    'column %i = %s hardware block %i (HW, labor, cabling, totals)',
    (col, key, i) => {
      const c = comparison.columns[col];
      const opt = MUZE.options.find((o) => o.key === key);
      expect(c.hardwareCost).toBeCloseTo(opt.hardware[i].expected.cost, 2);
      expect(c.hardwarePrice).toBeCloseTo(opt.hardware[i].expected.price, 2);
      expect(c.laborCost).toBeCloseTo(opt.labor.expected.cost, 2);
      expect(c.laborPrice).toBeCloseTo(opt.labor.expected.price, 2);
      expect(c.cablingCost).toBeCloseTo(opt.wiring.expected.cost, 2);
      expect(c.cablingPrice).toBeCloseTo(opt.wiring.expected.price, 2);
      expect(c.totalCost).toBeCloseTo(opt.summaries[i].cost, 2);
      expect(c.totalPrice).toBeCloseTo(opt.summaries[i].price, 2);
      expect(c.markup).toBeCloseTo(c.totalPrice - c.totalCost, 2);
    }
  );

  it('$/unit/month = (hardware + labor price) / 400 units / 60 months', () => {
    for (const c of comparison.columns) {
      expect(c.managedWifiPrice).toBeCloseTo(c.hardwarePrice + c.laborPrice, 2);
      expect(c.perUnitPerMonth).toBeCloseTo(c.managedWifiPrice / comparison.units / comparison.termMonths, 5);
    }
    expect(comparison.columns[0].perUnitPerMonth).toBeCloseTo(31.87, 2);
  });

  it('margin is computed everywhere except the Cambium Wi-Fi 7 cell, which the workbook hardcodes (drift)', () => {
    comparison.columns.forEach((c, i) => {
      const computed = (c.totalPrice - c.totalCost) / c.totalPrice;
      if (i === 3) {
        expect(c.margin).toBeCloseTo(0.2711, 3); // typed in; the tab itself says 38.0%
        expect(computed).toBeCloseTo(0.3802, 3);
      } else {
        expect(c.margin).toBeCloseTo(computed, 5);
      }
    });
  });

  it('recurring: support fee bills $4.75 per unit per month; rXg is $12,090 a year', () => {
    for (const c of comparison.columns) {
      expect(c.mrc.supportFeePrice).toBe(comparison.units * comparison.supportFeePerUnitPerMonth);
      expect(c.mrc.supportFeeCost).toBe(900);
      expect(c.mrc.segra5g).toBe(1695);
      expect(c.mrc.frontier5g).toBe(2000);
    }
    expect(comparison.columns[2].mrc.rxgMonthly).toBeCloseTo(12090 / 12, 2);
    expect(comparison.columns[4].mrc.rxgMonthly).toBeCloseTo(12090 / 12, 2);
  });

  it('financing figures are lender quotes (entered, not derived) — present for every column', () => {
    for (const c of comparison.columns) {
      expect(c.financing.monthly60).toBeGreaterThan(0);
      expect(c.financing.monthly36).toBeGreaterThan(c.financing.monthly60);
      expect(c.financing.upliftNeeded).toBeGreaterThan(0);
    }
    expect(comparison.columns[0].financing).toEqual({ monthly60: 26877, monthly36: 36278, upliftNeeded: 156723 });
  });
});

// ---------------------------------------------------------------------------
// Engine parity roadmap — each phase turns its todo into a real assertion
// against the Builder's own engines (see plan §5).
describe('Builder engine parity with the Muze workbook (one todo per phase)', () => {
  it('Phase 1: importing the architect\'s unit mix reproduces 400 units / 598 beds and the row-60 per-level counts', () => {
    const rows = parseDelimited(muzeUnitSchedulePaste());
    const mapping = guessUnitScheduleMapping(rows);
    expect(mapping.headerRows).toBe(2);
    expect(mapping.levelCols).toHaveLength(20);
    const parsed = parseUnitSchedule(rows, mapping);
    expect(parsed.unitTypes).toHaveLength(MUZE.unitTypes.length);

    const model = normalizePropertyModel(propertyFromImport(parsed));
    const totals = propertyTotals(model);
    expect(totals.units).toBe(MUZE.takeoff.totalUnits);
    expect(totals.beds).toBe(MUZE.takeoff.totalBeds);
    const levels = orderedLevels(model);
    const byLevel = Object.fromEntries(levels.map((l, i) => [MUZE.levels[i].id, totals.byLevel[l.id].units]));
    expect(byLevel).toEqual(MUZE.takeoff.unitsByLevel);
    expect(model.buildings.map((b) => b.name)).toEqual(['Building 1', 'Building 2', 'Building 3', 'Building 4', 'Townhomes']);
    expect(model.rooms).toHaveLength(20); // one telecom room per level; the takeoff's 18 IDF + MDF is a later merge
  });
  it('Phase 2: coverage rules + per-room sizing reproduce 400 / 438 APs, 38 in-unit switches, and the 20×8 / 12×24 / 11×48 plan', () => {
    const property = importMuzeProperty();
    const levels = orderedLevels(property);
    const roomOfFixtureLevel = Object.fromEntries(MUZE.levels.map((l, i) => [l.id, levels[i].roomId]));

    // Coverage: baseline 1 AP per unit; extended doubles 3-bedroom + townhomes.
    const baseline = buildWifiTakeoff(property, { enabled: true });
    expect(baseline.unitAPs).toBe(MUZE.takeoff.coverage.baseline.totalAPs); // 400
    const extended = buildWifiTakeoff(property, { enabled: true, apsPerClass: { 3: 2, th: 2 }, inUnitSwitchSku: 'TPL-4PORT' });
    expect(extended.unitAPs).toBe(MUZE.takeoff.coverage.extended.totalAPs); // 438
    expect(extended.multiApUnits).toBe(38);
    expect(extended.townhomeUnits).toBe(16);
    const apsByFixtureLevel = Object.fromEntries(MUZE.levels.map((l, i) => [l.id, extended.apsByLevel[levels[i].id]]));
    expect(apsByFixtureLevel).toEqual(MUZE.takeoff.coverage.extended.apsByLevel);
    expect(extended.amenityAPs).toBe(14); // the workbook types 13 — documented drift
    expect(extended.outdoorAPs).toBe(9);

    // Per-room switch sizing against the Ruckus PoE budgets.
    const inputs = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better', deploymentType: 'ceiling', includeShipping: false };
    const products = [...BASE_PRODUCTS, ...MUZE_RUCKUS];
    const computed = calculateBOM(inputs, {}, {}, products, [], null, extended);
    expect(computed.guestRoomAPs).toBe(438);
    expect(computed.totalAPs).toBe(438 + 14 + 9);
    expect(computed.inUnitSwitches).toBe(38);
    expect(computed.items.find((i) => i.sku === 'TPL-4PORT').qty).toBe(38);
    expect(computed.idfCount).toBe(18); // 19 telecom rooms less the MDF
    expect(computed.needsAggSwitch).toBe(true);
    // Computed: 12 × 24 and 11 × 48 exactly as the workbook, plus one 8-port per townhome.
    expect({ s8: computed.idfSwitches8, s24: computed.idfSwitches24, s48: computed.idfSwitches48 }).toEqual({ s8: 16, s24: 12, s48: 11 });
    // Every non-townhome room matches the workbook's hand-picked 24 / 48 mix …
    for (const l of MUZE.levels.filter((x) => x.id !== 'th')) {
      const room = computed.idfPlan.find((p) => p.roomId === roomOfFixtureLevel[l.id]);
      const plan = MUZE.takeoff.switchPlan[l.id];
      expect({ level: l.id, s24: room.s24, s48: room.s48 }).toEqual({ level: l.id, s24: plan.s24, s48: plan.s48 });
    }
    // … and the four Building 3 rooms carry a hand-added 8-port (a second
    // closet for cable distance), which is exactly what room overrides are for.
    const roomOverrides = {};
    for (const l of MUZE.levels.filter((x) => x.building === 3 && x.level !== 'BSMT')) {
      roomOverrides[roomOfFixtureLevel[l.id]] = MUZE.takeoff.switchPlan[l.id];
    }
    const overridden = calculateBOM(inputs, {}, {}, products, [], null, buildWifiTakeoff(property, { enabled: true, apsPerClass: { 3: 2, th: 2 }, roomOverrides }));
    expect({ s8: overridden.idfSwitches8, s24: overridden.idfSwitches24, s48: overridden.idfSwitches48 }).toEqual(MUZE.takeoff.switchTotals.s8 !== undefined
      ? { s8: MUZE.takeoff.switchTotals.s8, s24: MUZE.takeoff.switchTotals.s24, s48: MUZE.takeoff.switchTotals.s48 }
      : { s8: 20, s24: 12, s48: 11 });
    expect(overridden.idfPlan.reduce((s, p) => s + p.s8 * 8 + p.s24 * 24 + p.s48 * 48, 0)).toBe(MUZE.takeoff.switchTotals.ports); // 976
    expect(overridden.items.find((i) => i.sku === 'ICX-8100-C08PF').qty).toBe(20);
    expect(overridden.items.find((i) => i.sku === 'ICX-8100-24P').qty).toBe(12);
    expect(overridden.items.find((i) => i.sku === 'ICX-8100-48PFX').qty).toBe(11);
  });
  it('Phase 3: the seeded kits roll up to the rack schedule and Digital Infrastructure quotes them per telecom room', () => {
    const products = rollUpAssemblies(mergeProducts([]));
    const kit = (sku) => products.find((p) => p.sku === sku);
    const expected = (key) => MUZE.kits.find((k) => k.key === key).expectedCost;
    expect(kit('KIT-IDF-12U').cost).toBeCloseTo(expected('idf-12u'), 2); // 2,940.32
    expect(kit('KIT-MDF-22U').cost).toBeCloseTo(expected('mdf-22u'), 2); // 3,623.98
    expect(kit('KIT-IDF-12U-FTTU').cost).toBeCloseTo(expected('idf-12u-fttu'), 2);
    expect(kit('KIT-MDF-22U-FTTU').cost).toBeCloseTo(expected('mdf-22u-fttu'), 2);
    expect(kit('KIT-MEDIA-PANEL').cost).toBeCloseTo(expected('media-panel'), 2); // 179.77

    const property = importMuzeProperty();
    const lines = computeInfrastructureLines(property, products);
    const line = (sku) => lines.find((l) => l.sku === sku);
    expect(line('KIT-MDF-22U').qty).toBe(1);
    expect(line('KIT-IDF-12U').qty).toBe(18); // 19 telecom rooms less the MDF; the townhome room hosts no kit
    expect(line('KIT-MEDIA-PANEL').qty).toBe(400);
    expect(line('KIT-IDF-12U').parts).toHaveLength(13);
    expect(lines.every((l) => !l.missing)).toBe(true);

    // OPT 1's rack rows: 18 IDF racks and 1 MDF rack at the kit costs.
    const opt1 = MUZE.options[0].hardware[0].rows;
    expect(opt1.find((r) => r.role === 'IDF RACK')).toMatchObject({ qty: 18 });
    expect(line('KIT-IDF-12U').cost).toBeCloseTo(opt1.find((r) => r.role === 'IDF RACK').eaCost, 2);
    expect(line('KIT-MDF-22U').cost).toBeCloseTo(opt1.find((r) => r.role === 'MDF RACK').eaCost, 2);
    expect(line('KIT-MEDIA-PANEL').cost).toBeCloseTo(MUZE.options[0].wiring.rows.find((r) => r.run === 'MEDIA PANEL').dropCost, 2);

    // Install hours match the labor table: MDF 16 h, IDF 8 h × 18, media panel 1 h × 400.
    const labor = MUZE.options[0].labor.rows;
    const hoursFor = (task) => labor.find((r) => r.task === task);
    const expectedHours = hoursFor('MDF RACK').qty * hoursFor('MDF RACK').hours + hoursFor('IDF RACK').qty * hoursFor('IDF RACK').hours + hoursFor('MEDIA PANEL').qty * hoursFor('MEDIA PANEL').hours;
    expect(infrastructureLaborHours(property)['install-tech']).toBe(expectedHours); // 560
  });
  it.todo('Phase 4: the cabling takeoff reproduces OPT 1 wiring 243,433 → 437,006.20');
  it.todo('Phase 5: cost-plus pricing + labor tasks reproduce OPT 1 hardware 383,063.97 → 529,643.83 and labor 141,800 → 235,250');
  it.todo('Phase 6: the options comparison matches the Comparison Matrix NRC block for all five columns');
  it.todo('Phase 7: recurring + financing shows $31.87 per unit per month for OPT 1');
  it.todo('Phase 8: XGS-PON reproduces OPT 4 hardware 404,860.26 → 578,929.23 and wiring 196,528 → 330,951.20');
});
