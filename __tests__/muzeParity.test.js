import { describe, it, expect } from 'vitest';
import { MUZE } from './fixtures/muze';

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
  it.todo('Phase 1: lib/propertyModel totals 400 units / 598 beds / row-60 per-level counts from the imported grid');
  it.todo('Phase 2: calculateBOM with an idfPlan reproduces 400 / 438 APs, 38 in-unit switches, 20×8 / 12×24 / 11×48');
  it.todo('Phase 3: assemblies roll up IDF 2,940.32 / MDF 3,623.98 / media panel 179.77 from catalog components');
  it.todo('Phase 4: the cabling takeoff reproduces OPT 1 wiring 243,433 → 437,006.20');
  it.todo('Phase 5: cost-plus pricing + labor tasks reproduce OPT 1 hardware 383,063.97 → 529,643.83 and labor 141,800 → 235,250');
  it.todo('Phase 6: the options comparison matches the Comparison Matrix NRC block for all five columns');
  it.todo('Phase 7: recurring + financing shows $31.87 per unit per month for OPT 1');
  it.todo('Phase 8: XGS-PON reproduces OPT 4 hardware 404,860.26 → 578,929.23 and wiring 196,528 → 330,951.20');
});
