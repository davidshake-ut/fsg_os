import { describe, it, expect } from 'vitest';
import { buildQuoteSummary, normalizeSummary, buildOptionComparison, customerRows, optionHeads, signedText } from '../lib/optionComparison';

const bom = (o = {}) => ({ items: [{ sku: 'x', qty: 1 }], serviceItems: [], totalHardwareCost: 0, totalHardwarePrice: 0, shippingCost: 0, shippingPrice: 0, grandTotalCost: 0, grandTotalPrice: 0, ...o });

describe('buildQuoteSummary', () => {
  const sections = [
    { title: 'Managed Wi-Fi', techId: 'managed_wifi', bom: bom({ totalHardwareCost: 1000, totalHardwarePrice: 1500, shippingCost: 70, shippingPrice: 105 }) },
    {
      title: 'Digital Infrastructure',
      techId: 'digital_infrastructure',
      bom: bom({
        totalHardwareCost: 500, totalHardwarePrice: 625,
        serviceItems: [
          { category: 'Cabling', totalCost: 200, totalPrice: 400 },
          { category: 'Service', totalCost: 30, totalPrice: 60 },
        ],
      }),
    },
    { title: 'Alt vendor', techId: 'managed_wifi', optionGroup: 'managed_wifi', isPrimary: false, bom: bom({ totalHardwareCost: 9999, totalHardwarePrice: 9999 }) },
    { title: 'Professional Labor', isLabor: true, bom: bom({ items: [], serviceItems: [{ sku: 'l' }], totalServicesCost: 300, totalServicesPrice: 500 }) },
  ];
  const labor = { totalServicesCost: 300, totalServicesPrice: 500 };
  const wifiBom = { unitCount: 400, totalAPs: 438, totalIdfSwitches: 43, needsAggSwitch: true, idfCount: 18 };
  const inputs = { wifiGeneration: 'wifi6', wifiTakeoff: { enabled: true }, techCalc: { digital_infrastructure: { cabling: { enabled: true, runs: {} } } } };

  it('buckets hardware (+ shipping), labor (rate card + non-cabling services), and cabling; skips Option-B alternates', () => {
    const s = buildQuoteSummary({ sections, labor, bom: wifiBom, inputs, pricingMode: 'costPlus' });
    expect(s.hardware).toEqual({ cost: 1570, price: 2230 });
    expect(s.labor).toEqual({ cost: 330, price: 560 });
    expect(s.cabling).toEqual({ cost: 200, price: 400 });
    expect(s.total).toEqual({ cost: 2100, price: 3190 });
    expect(s).toMatchObject({ units: 400, aps: 438, switches: 44, idfs: 18, wifiGeneration: 'wifi6', designSource: 'property', fiberToUnits: true, architecture: 'active_ethernet', pricingMode: 'costPlus' });
    expect(s.techs).toEqual(['managed_wifi', 'digital_infrastructure']);
  });

  it('fiber to units reads the cabling run; null without Digital Infrastructure', () => {
    const off = { ...inputs, techCalc: { digital_infrastructure: { cabling: { enabled: true, runs: { unitFiber: { enabled: false } } } } } };
    expect(buildQuoteSummary({ sections, labor, bom: wifiBom, inputs: off }).fiberToUnits).toBe(false);
    expect(buildQuoteSummary({ sections: sections.slice(0, 1), labor, bom: wifiBom, inputs }).fiberToUnits).toBeNull();
    expect(buildQuoteSummary({}).total).toEqual({ cost: 0, price: 0 });
  });
});

describe('normalizeSummary', () => {
  it('reads a stored summary and falls back to the quote totals for older quotes', () => {
    const s = normalizeSummary({ total_price: 100, total_cost: 60 });
    expect(s.total).toEqual({ cost: 60, price: 100 });
    expect(s.hasBuckets).toBe(false);
    const full = normalizeSummary({ summary: { units: 10, hardware: { cost: 1, price: 2 }, labor: { cost: 3, price: 4 }, cabling: { cost: 5, price: 6 }, total: { cost: 9, price: 12 }, fiberToUnits: true } });
    expect(full.hasBuckets).toBe(true);
    expect(full.fiberToUnits).toBe(true);
    expect(full.units).toBe(10);
  });
});

describe('buildOptionComparison', () => {
  const opt = (id, label, hw, lb, cb, extra = {}) => ({
    id,
    label,
    quote: { option_label: label, summary: { units: 400, aps: 400, hardware: hw, labor: lb, cabling: cb, total: { cost: hw.cost + lb.cost + cb.cost, price: hw.price + lb.price + cb.price }, wifiGeneration: 'wifi6', fiberToUnits: true, architecture: 'active_ethernet', ...extra } },
  });
  const a = opt('a', 'Baseline', { cost: 100000, price: 150000 }, { cost: 20000, price: 30000 }, { cost: 10000, price: 15000 });
  const b = opt('b', 'Extended', { cost: 120000, price: 180000 }, { cost: 22000, price: 33000 }, { cost: 10000, price: 15000 }, { aps: 438, wifiGeneration: 'wifi7' });

  it('rows per bucket with deltas against the first option, managed Wi-Fi and per-unit-per-month', () => {
    const c = buildOptionComparison([a, b], { termMonths: 60 });
    const row = (k) => c.rows.find((r) => r.key === k);
    expect(c.columns.map((x) => x.label)).toEqual(['Baseline', 'Extended']);
    expect(row('totalPrice').values).toEqual([195000, 228000]);
    expect(row('totalPrice').deltas).toEqual([null, 33000]);
    expect(row('managedWifiPrice').values).toEqual([180000, 213000]);
    expect(row('perUnitPerMonth').values[0]).toBeCloseTo(180000 / 400 / 60, 9);
    expect(row('margin').values[0]).toBeCloseTo(((195000 - 130000) / 195000) * 100, 9);
    expect(row('wifiGeneration').values).toEqual(['Wi-Fi 6', 'Wi-Fi 7']);
    expect(row('wifiGeneration').deltas).toEqual([null, null]);
    expect(c.units).toBe(400);
  });

  it('customer rows carry no cost or margin', () => {
    const rows = customerRows(buildOptionComparison([a, b]));
    expect(rows.map((r) => r.key)).not.toEqual(expect.arrayContaining(['hardwareCost', 'laborCost', 'cablingCost', 'totalCost', 'grossProfit', 'margin']));
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(['hardwarePrice', 'laborPrice', 'cablingPrice', 'totalPrice', 'perUnitPerMonth', 'aps', 'wifiGeneration', 'fiberToUnits', 'architecture']));
  });

  it('units can be forced and the term changes the per-unit figure', () => {
    const c = buildOptionComparison([a], { termMonths: 36, units: 200 });
    expect(c.rows.find((r) => r.key === 'perUnitPerMonth').values[0]).toBeCloseTo(180000 / 200 / 36, 9);
    expect(c.rows.find((r) => r.key === 'perUnitPerMonth').label).toContain('36 months');
  });
});

describe('recurring + financing (Phase 7)', () => {
  const summary = (o = {}) => ({
    units: 100,
    hardware: { cost: 60000, price: 80000 },
    labor: { cost: 10000, price: 20000 },
    cabling: { cost: 0, price: 0 },
    total: { cost: 70000, price: 100000 },
    ...o,
  });
  it('the summary carries the monthly totals and the payment options', () => {
    const s = buildQuoteSummary({
      sections: [{ title: 'Wi-Fi', techId: 'managed_wifi', bom: bom({ totalHardwareCost: 60000, totalHardwarePrice: 100000 }) }],
      bom: { unitCount: 100 },
      inputs: { recurring: { items: [{ kind: 'support', cost: 900, price: 4.75, priceBasis: 'per_unit' }] } },
      financing: { enabled: true, apr: 12, terms: [60], lenderDiscountPct: 0 },
    });
    expect(s.recurring).toEqual({ monthlyCost: 900, monthlyPrice: 475, perUnitMonth: 4.75, items: 1 });
    expect(s.financing.enabled).toBe(true);
    expect(s.financing.principal).toBe(100000);
    expect(s.financing.options).toHaveLength(1);
    expect(s.financing.options[0].monthly).toBeCloseTo(2224.44, 2);
    expect(buildQuoteSummary({}).financing).toBeNull();
    expect(buildQuoteSummary({}).recurring.items).toBe(0);
  });
  it('rows appear only when an option carries them; a missing term reads as null with no delta', () => {
    const none = buildOptionComparison([{ id: 'a', quote: { summary: summary() } }]);
    expect(none.rows.some((r) => /^mrc|^finance/.test(r.key))).toBe(false);
    const cmp = buildOptionComparison([
      { id: 'a', quote: { summary: summary({ recurring: { monthlyCost: 900, monthlyPrice: 1500, perUnitMonth: 15, items: 2 }, financing: { enabled: true, principal: 100000, uplift: 0, options: [{ months: 60, monthly: 2224.44, total: 133466.4, perUnitMonth: 22.24 }] } }) } },
      { id: 'b', quote: { summary: summary({ total: { cost: 70000, price: 110000 }, financing: { enabled: true, principal: 110000, uplift: 0, options: [{ months: 36, monthly: 3653.57, total: 0, perUnitMonth: 0 }, { months: 60, monthly: 2446.88, total: 0, perUnitMonth: 0 }] } }) } },
      { id: 'c', quote: { summary: summary() } },
    ]);
    const row = (k) => cmp.rows.find((r) => r.key === k);
    expect(row('mrcPrice').values).toEqual([1500, 0, 0]);
    expect(row('mrcPerUnit').values[0]).toBe(15);
    expect(row('finance36').values).toEqual([null, 3653.57, null]);
    expect(row('finance36').deltas).toEqual([null, null, null]);
    expect(row('finance60').values).toEqual([2224.44, 2446.88, null]);
    expect(row('finance60').deltas[1]).toBeCloseTo(222.44, 2);
    expect(row('financingUplift').customer).toBe(false);
    expect(row('mrcCost').customer).toBe(false);
    expect(row('finance60').customer).toBe(true);
    // Order: the NRC block, then recurring, then financing, then the facts.
    const keys = cmp.rows.map((r) => r.key);
    expect(keys.indexOf('margin')).toBeLessThan(keys.indexOf('mrcCost'));
    expect(keys.indexOf('mrcPerUnit')).toBeLessThan(keys.indexOf('finance36'));
    expect(keys.indexOf('financingUplift')).toBeLessThan(keys.indexOf('units'));
  });
});

describe('optionHeads / signedText', () => {
  it('returns one latest version per option in creation order', () => {
    const quotes = [
      { id: 'a1', option_group_id: 'g', created_at: '2026-01-01', version: 1 },
      { id: 'a2', option_group_id: 'g', parent_quote_id: 'a1', created_at: '2026-01-05', version: 2 },
      { id: 'b1', option_group_id: 'g', created_at: '2026-01-03', version: 1 },
      { id: 'x', option_group_id: 'other', created_at: '2026-01-02' },
      { id: 'z', created_at: '2026-01-02' },
    ];
    expect(optionHeads(quotes, 'g').map((q) => q.id)).toEqual(['b1', 'a2']);
  });

  it('signedText', () => {
    expect(signedText(5, (x) => `$${x}`)).toBe('+$5');
    expect(signedText(-5, (x) => `$${x}`)).toBe('-$5');
    expect(signedText(0, (x) => `$${x}`)).toBe('$0');
  });
});
