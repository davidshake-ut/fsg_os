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
import { computeInfrastructureLines, computeKitLines, infrastructureLaborHours } from '../lib/infrastructureLines';
import { deriveCablingRuns, computeCablingLines, cablingTotals } from '../lib/cablingTakeoff';
import { normalizePricingPolicy, applyPricingPolicy, priceWithMarkup } from '../lib/pricingPolicy';
import { buildOptionComparison, customerRows } from '../lib/optionComparison';
import { MULTIFAMILY_TAKEOFF_TASKS } from '../lib/laborTasks';
import { estimateLaborHours } from '../lib/estimateLaborHours';
import { calculateLabor } from '../lib/calculateLabor';
import { DEFAULT_LABOR_ROLES } from '../lib/defaults';

// The full OPT 1 gear list, tagged for the takeoff engine: licenses linked
// per device (the workbook folds the $179.06 Ruckus One term into each
// device's cost) and the $7.50 the workbook adds to every switch's cost
// carried in the switch cost itself.
const MUZE_RUCKUS_OPT1 = [
  { sku: 'RUCKUS-ONE-5', desc: 'Ruckus One 5-year term', category: 'Subscription', technology: 'managed_wifi', vendor: 'Ruckus', cost: 179.06, price: 250 },
  { sku: 'CCR2216', desc: 'MikroTik CCR2216-1G-12XS-2XQ router', category: 'Gateway', technology: 'managed_wifi', vendor: 'MikroTik', cost: 1500, price: 2795, quality_tier: 'better' },
  { sku: 'ICX7550-48F', desc: 'Ruckus ICX7550-48F core switch', category: 'Aggregate Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 3000, price: 5086.5, quality_tier: 'better', license_sku_5yr: 'RUCKUS-ONE-5' },
  { sku: 'R650', desc: 'Ruckus R650 Wi-Fi 6 AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'Ruckus', cost: 418.98, price: 1305, mount_type: 'ceiling', quality_tier: 'better', poe_watts: 22, license_sku_5yr: 'RUCKUS-ONE-5' },
  { sku: 'T350', desc: 'Ruckus T350 outdoor AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'Ruckus', cost: 571.48, price: 1780, mount_type: 'outdoor', quality_tier: 'better', poe_watts: 22, license_sku_5yr: 'RUCKUS-ONE-5' },
  { sku: 'ICX-8100-C08PF', desc: 'ICX 8100 8-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 437.69 + 7.5, price: 1980, quality_tier: 'better', port_count: 8, poe_budget_watts: 124, license_sku_5yr: 'RUCKUS-ONE-5' },
  { sku: 'ICX-8100-24P', desc: 'ICX 8100 24-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 739.61 + 7.5, price: 4015, quality_tier: 'better', port_count: 24, poe_budget_watts: 370, license_sku_5yr: 'RUCKUS-ONE-5' },
  { sku: 'ICX-8100-48PFX', desc: 'ICX 8100 48-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Ruckus', cost: 1458.95 + 7.5, price: 7700, quality_tier: 'better', port_count: 48, poe_budget_watts: 740, license_sku_5yr: 'RUCKUS-ONE-5' },
];

// The Muze property as the Builder would hold it after the Phase 1 import,
// plus the takeoff's named lists (14 amenity rooms listed, 9 outdoor APs).
// `amenityRooms` trims the list to the workbook's typed 13 when a check
// needs the workbook's own count rather than the listed one.
function importMuzeProperty({ amenityRooms = null } = {}) {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  const model = normalizePropertyModel(propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows))));
  const amenity = amenityRooms === null ? MUZE.takeoff.amenityLocations : MUZE.takeoff.amenityLocations.slice(0, amenityRooms);
  return {
    ...model,
    amenityLocations: amenity.map((name, i) => ({ id: `am${i}`, name, qty: 1 })),
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
  it('Phase 4: the cabling takeoff derives the per-unit and per-location runs and reproduces OPT 1 wiring at cost', () => {
    const property = importMuzeProperty({ amenityRooms: 13 }); // the workbook's typed amenity count
    const products = rollUpAssemblies(mergeProducts([]));
    const wiring = MUZE.options[0].wiring;
    const row = (run) => wiring.rows.find((r) => r.run === run);

    // What derives from the property on its own …
    const derived = deriveCablingRuns(property, { unitAPs: 400 });
    expect(derived.streetToMdf.derived).toBe(row('STREET TO MDF').qty); // 1
    expect(derived.unitCat6.derived).toBe(row('IDF TO UNIT (CAT6)').qty); // 400
    expect(derived.unitFiber.derived).toBe(row('IDF TO UNIT (FIBER)').qty); // 400
    expect(derived.inUnitCat6.derived).toBe(row('IN UNIT (CAT6)').qty); // 400 = baseline APs
    expect(derived.commonDrops.derived).toBe(row('AMENITY & COMMON').qty); // 22 = 13 + 9 + 0
    expect(derived.townhomeDrops.derived).toBe(16); // one per townhome (OPT 4's count; OPT 1–3 typed 4)
    // … and what the workbook entered by judgment: 6 risers where the property has 5
    // buildings, 23 closet links where a chain per building gives 15.
    expect(derived.backbone.derived).toBe(5);
    expect(derived.idfLinks.derived).toBe(15);
    // Extended coverage moves the in-unit drops to 438 (OPT 2's row).
    const extended = { wifiTakeoff: { enabled: true, apsPerClass: { 3: 2, th: 2 } } };
    expect(deriveCablingRuns(property, { inputs: extended }).inUnitCat6.derived).toBe(MUZE.options[1].wiring.rows.find((r) => r.run === 'IN UNIT (CAT6)').qty);

    // Enter the judgment counts and price the runs.
    const idfLinks = wiring.rows.filter((r) => r.run.startsWith('IDF TO IDF')).reduce((s, r) => s + r.qty, 0); // 23
    const entered = {
      ...property,
      cabling: { enabled: true, runs: { backbone: { qty: row('MDF TO IDFs').qty }, idfLinks: { qty: idfLinks }, townhomeDrops: { qty: row('TOWNHOME').qty } } },
    };
    const lines = computeCablingLines(entered, products, { unitAPs: 400 });
    expect(lines.every((l) => !l.missing && l.isService)).toBe(true);
    const byKey = Object.fromEntries(lines.map((l) => [l.runKey, l]));
    expect(byKey.streetToMdf).toMatchObject({ qty: 1, cost: row('STREET TO MDF').dropCost, price: row('STREET TO MDF').dropPrice });
    expect(byKey.backbone).toMatchObject({ qty: 6, cost: 3000, price: 5000 });
    expect(byKey.idfLinks).toMatchObject({ qty: 23, cost: 125, price: 275 });
    expect(byKey.unitCat6).toMatchObject({ qty: 400, cost: 125, price: 275 });
    expect(byKey.unitFiber).toMatchObject({ qty: 400, cost: 125, price: 275 });
    expect(byKey.inUnitCat6).toMatchObject({ qty: 400, cost: 90, price: 150 });
    expect(byKey.commonDrops).toMatchObject({ qty: 22, cost: 275, price: 385 });
    expect(byKey.townhomeDrops).toMatchObject({ qty: 4, cost: 275, price: 385 });

    // The workbook's wiring block = these runs + the media panel, which is
    // the Phase 3 kit (a hardware line): cost reproduces to the cent.
    const totals = cablingTotals(lines);
    const panel = computeKitLines(entered, products).find((l) => l.sku === 'KIT-MEDIA-PANEL');
    const panelRow = row('MEDIA PANEL');
    expect(panel.qty).toBe(panelRow.qty);
    expect(panel.cost).toBeCloseTo(panelRow.dropCost, 2);
    expect(totals.cost + panel.qty * panel.cost).toBeCloseTo(wiring.expected.cost, 2); // 243,433
    // Sell price: the runs match; the panel's price is the kit roll-up until
    // Phase 5's pricing policy sets the Enclosure markup the workbook used (×1.4).
    expect(totals.price).toBeCloseTo(wiring.expected.price - panelRow.qty * panelRow.dropPrice, 2); // 336,335
    expect(totals.cost).toBe(171525);
  });
  it('Phase 5a: the cost-plus policy IS the workbook\'s pricing rule — OPT 1 hardware 383,063.97 → 529,643.83', () => {
    // Every OPT 1 hardware row as a catalog product in the subcategory the
    // policy keys on, priced by the policy; the 5% misc allowance sells at
    // the Miscellaneous markup like the sheet.
    const opt1 = MUZE.options[0].hardware[0];
    const category = (role) =>
      /ROUTER|GATEWAY/.test(role) ? 'Gateway'
        : /CORE/.test(role) ? 'Aggregate Switch'
        : /AP$/.test(role) ? 'Access Point'
        : /SW$/.test(role) ? 'Switch'
        : /RACK/.test(role) ? 'Rack'
        : /SFP/.test(role) ? 'Fiber Module'
        : 'Miscellaneous';
    const products = opt1.rows.map((r) => ({ sku: r.role, category: category(r.role), cost: r.eaCost, price: 0 }));
    const policy = normalizePricingPolicy({ mode: 'costPlus' });
    const priced = applyPricingPolicy(products, policy);
    // The policy's markups equal the workbook's per-row markups.
    for (const r of opt1.rows) expect(priced.find((p) => p.sku === r.role).policyMarkupPct / 100).toBeCloseTo(r.markup, 9);
    const extCost = opt1.rows.reduce((s, r) => s + r.qty * r.eaCost, 0);
    const extPrice = opt1.rows.reduce((s, r) => s + r.qty * priced.find((p) => p.sku === r.role).price, 0);
    const miscCost = extCost * opt1.misc.pct;
    const miscPrice = priceWithMarkup(miscCost, 25);
    expect(extCost + miscCost).toBeCloseTo(opt1.expected.cost, 2); // 383,063.97
    expect(extPrice + miscPrice).toBeCloseTo(opt1.expected.price, 2); // 529,643.83
  });

  // OPT 1 quotes baseline APs (400) but keeps the switch layout the
  // workbook sized on the EXTENDED plan (its switch rows point at rows
  // 87–89): Building 3's rooms carry a hand-added 8-port, and B2-L2 keeps a
  // 48-port where 16 baseline APs would fit a 24. Both are room overrides.
  function opt1RoomOverrides(property) {
    const levels = orderedLevels(property);
    const roomOfFixtureLevel = Object.fromEntries(MUZE.levels.map((l, i) => [l.id, levels[i].roomId]));
    const overrides = {};
    for (const l of MUZE.levels.filter((x) => (x.building === 3 && x.level !== 'BSMT') || x.id === 'b2-l2')) {
      overrides[roomOfFixtureLevel[l.id]] = MUZE.takeoff.switchPlan[l.id];
    }
    return overrides;
  }

  it('Phase 5b: the takeoff engine under cost-plus prices OPT 1\'s Ruckus gear row for row', () => {
    const property = importMuzeProperty({ amenityRooms: 13 });
    const takeoff = buildWifiTakeoff(property, { enabled: true, redundantGateway: true, itemizeAccessories: false, roomOverrides: opt1RoomOverrides(property) });
    expect(takeoff.racksFromKits).toBe(true);

    const policy = normalizePricingPolicy({ mode: 'costPlus' });
    const priced = applyPricingPolicy(rollUpAssemblies(mergeProducts([])).concat(MUZE_RUCKUS_OPT1), policy);
    const inputs = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better', deploymentType: 'ceiling', licenseTerm: 5, miscHwPercent: 5, includeShipping: false };
    const bom = calculateBOM(inputs, {}, {}, priced, [], null, takeoff);
    const line = (sku, noteRe = null) => bom.items.filter((i) => i.sku === sku && (!noteRe || noteRe.test(i.note)));
    const row = (role) => MUZE.options[0].hardware[0].rows.find((r) => r.role === role);
    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

    // Gateway pair, core switch, APs (units / amenity / outdoor), switches — cost and price per role.
    const roleCost = (skus) => sum(bom.items.filter((i) => skus.includes(i.sku)), (i) => i.totalCost);
    const rolePrice = (skus) => sum(bom.items.filter((i) => skus.includes(i.sku)), (i) => i.totalPrice);
    expect(line('CCR2216')[0]).toMatchObject({ qty: 2 });
    expect(roleCost(['CCR2216'])).toBeCloseTo(row('MIKROTIK ROUTER').qty * row('MIKROTIK ROUTER').eaCost, 6);
    expect(rolePrice(['CCR2216'])).toBeCloseTo(row('MIKROTIK ROUTER').qty * row('MIKROTIK ROUTER').eaCost * 1.25, 6);
    // Licenses ride with their device at the device's markup, so device + license = the workbook's folded row.
    const apLicense = line('RUCKUS-ONE-5', /license/).filter((i) => i.qty === 400)[0];
    expect(apLicense).toBeTruthy();
    const apCost = line('R650', /Guest/)[0].totalCost + apLicense.totalCost;
    expect(apCost).toBeCloseTo(row('AP').qty * row('AP').eaCost, 6); // 239,216
    expect(line('R650', /Guest/)[0].totalPrice + apLicense.totalPrice).toBeCloseTo(row('AP').qty * row('AP').eaCost * 1.4, 6); // 334,902.40
    expect(line('R650', /Amenity/)[0].qty).toBe(13);
    expect(line('T350')[0].qty).toBe(9);
    expect({ s8: bom.idfSwitches8, s24: bom.idfSwitches24, s48: bom.idfSwitches48 }).toEqual({ s8: 20, s24: 12, s48: 11 });
    // No legacy racks, patch cables, or gateway accessories in takeoff mode with kits quoted.
    for (const sku of ['RR1907-BK1', 'RS-1215', 'CAT6-5ft-BLUE', 'CAT6-15ft-BLACK', 'PSI5-1500RT120', 'SFP-1G-SX']) expect(line(sku)).toHaveLength(0);

    // Everything the engine derives (device + license lines) matches the
    // workbook's corresponding rows; the racks are Digital Infrastructure's
    // kits at the Rack markup.
    const engineCore = bom.items.filter((i) => !['Fiber Module', 'Cable', 'Miscellaneous'].includes(i.category));
    const kits = computeKitLines(property, priced).filter((l) => l.category === 'Rack');
    const sheetRows = MUZE.options[0].hardware[0].rows.filter((r) => !/SFP/.test(r.role));
    const sheetCost = sum(sheetRows, (r) => r.qty * r.eaCost);
    const sheetPrice = sum(sheetRows, (r) => r.qty * r.eaCost * (1 + r.markup));
    expect(sum(engineCore, (i) => i.totalCost) + sum(kits, (l) => l.qty * l.cost)).toBeCloseTo(sheetCost, 2); // 358,173.83
    expect(sum(engineCore, (i) => i.totalPrice) + sum(kits, (l) => l.qty * l.price)).toBeCloseTo(sheetPrice, 2); // 496,204.01
    // The misc allowance sells at cost × 1.25 like the sheet (its base differs:
    // racks live in Digital Infrastructure and the workbook types 61 optics).
    const misc = bom.items.find((i) => i.category === 'Miscellaneous');
    expect(misc.totalPrice).toBeCloseTo(misc.totalCost * 1.25, 6);
  });

  it('Phase 5c: the multifamily task table + the kits\' hours reproduce OPT 1 labor 141,800 → 235,250', () => {
    const property = importMuzeProperty({ amenityRooms: 13 });
    const takeoff = buildWifiTakeoff(property, { enabled: true, redundantGateway: true, roomOverrides: opt1RoomOverrides(property) });
    const inputs = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better', includeShipping: false };
    const bom = calculateBOM(inputs, {}, {}, [...BASE_PRODUCTS, ...MUZE_RUCKUS_OPT1], [], null, takeoff);
    expect(bom.totalAPs).toBe(422); // 400 + 13 amenity + 9 outdoor — the labor table's AP row

    // The workbook's task rows: AP 0.5 h, switches 2 / 4 / 8 h by class,
    // townhome rack 12 h × 4, PM 400 h, config 90 h, design 40 h; the
    // MDF / IDF / media-panel rows come from Digital Infrastructure.
    const tasks = MULTIFAMILY_TAKEOFF_TASKS.map((t) => (t.key === 'mf-th-rack' ? { ...t, qty: 4 } : t));
    const hours = estimateLaborHours({ wifiBom: bom, inputs, tasks, techContributions: [infrastructureLaborHours(property)] });
    expect(hours['install-tech']).toBe(422 * 0.5 + 20 * 2 + 12 * 4 + 11 * 8 + 4 * 12 + 560); // 995
    expect(hours['project-manager']).toBe(400);
    expect(hours['network-engineer']).toBe(130);

    // The workbook's rates: $90 / $150 for technicians and PM, $125 / $200 for engineering.
    const roles = DEFAULT_LABOR_ROLES.map((r) => ({
      ...r,
      costRate: r.key === 'network-engineer' ? 125 : 90,
      billRate: r.key === 'network-engineer' ? 200 : 150,
      hours: null,
    }));
    const labor = calculateLabor(roles, hours);
    expect(labor.totalServicesCost).toBeCloseTo(MUZE.options[0].labor.expected.cost, 2); // 141,800
    expect(labor.totalServicesPrice).toBeCloseTo(MUZE.options[0].labor.expected.price, 2); // 235,250
  });
  it('Phase 6: the options comparison reproduces the Comparison Matrix NRC block for all five columns', () => {
    // Each workbook option as a saved quote summary (the buckets the Builder
    // writes on save): hardware block, pro services, wiring block.
    const opt = (id, label, o, hwIndex = 0) => {
      const hw = o.hardware[hwIndex].expected;
      const lb = o.labor.expected;
      const wr = o.wiring.expected;
      return {
        id,
        label,
        quote: {
          option_label: label,
          summary: {
            units: MUZE.comparison.units,
            hardware: { cost: hw.cost, price: hw.price },
            labor: { cost: lb.cost, price: lb.price },
            cabling: { cost: wr.cost, price: wr.price },
            total: { cost: hw.cost + lb.cost + wr.cost, price: hw.price + lb.price + wr.price },
          },
        },
      };
    };
    const [o1, o2, o3, o4] = MUZE.options;
    const options = [
      opt('opt1', 'OPT 1: WIFI 6 BASELINE', o1),
      opt('opt2', 'OPT 2: WIFI 6 EXT COVERAGE', o2),
      opt('opt3r', 'OPT 3: EXT WIFI 7 w RUCKUS / RG NETS', o3, 1),
      opt('opt3c', 'OPT 3: EXT WIFI 7 w CAMBIUM', o3, 0),
      opt('opt4', 'OPT 5: EXT HYBRID FTTU', o4),
    ];
    const cmp = buildOptionComparison(options, { termMonths: MUZE.comparison.termMonths });
    const row = (k) => cmp.rows.find((r) => r.key === k);
    expect(cmp.columns.map((c) => c.label)).toEqual(MUZE.comparison.columns.map((c) => c.label));

    MUZE.comparison.columns.forEach((col, i) => {
      expect(row('hardwareCost').values[i]).toBeCloseTo(col.hardwareCost, 2);
      expect(row('hardwarePrice').values[i]).toBeCloseTo(col.hardwarePrice, 2);
      expect(row('laborCost').values[i]).toBeCloseTo(col.laborCost, 2);
      expect(row('laborPrice').values[i]).toBeCloseTo(col.laborPrice, 2);
      expect(row('managedWifiPrice').values[i]).toBeCloseTo(col.managedWifiPrice, 2);
      expect(row('perUnitPerMonth').values[i]).toBeCloseTo(col.perUnitPerMonth, 5);
      expect(row('cablingCost').values[i]).toBeCloseTo(col.cablingCost, 2);
      expect(row('cablingPrice').values[i]).toBeCloseTo(col.cablingPrice, 2);
      expect(row('totalCost').values[i]).toBeCloseTo(col.totalCost, 2);
      expect(row('totalPrice').values[i]).toBeCloseTo(col.totalPrice, 2);
      expect(row('grossProfit').values[i]).toBeCloseTo(col.markup, 2);
      // Margin is computed everywhere; the workbook's Cambium Wi-Fi 7 cell is typed (drift).
      if (i !== 3) expect(row('margin').values[i] / 100).toBeCloseTo(col.margin, 5);
      else expect(row('margin').values[i] / 100).toBeCloseTo(0.3802, 3);
    });
    // Deltas read against the first option, like the matrix's C21 / E21 cells.
    expect(row('totalPrice').deltas[1]).toBeCloseTo(MUZE.comparison.columns[1].totalPrice - MUZE.comparison.columns[0].totalPrice, 2);
    expect(customerRows(cmp).some((r) => /cost|margin|profit/i.test(r.label))).toBe(false);
  });
  it.todo('Phase 7: recurring + financing shows $31.87 per unit per month for OPT 1');
  it.todo('Phase 8: XGS-PON reproduces OPT 4 hardware 404,860.26 → 578,929.23 and wiring 196,528 → 330,951.20');
});
