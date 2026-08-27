import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CARRIER_CIRCUITS,
  normalizeCarrierCircuits,
  normalizeRecurring,
  normalizeRecurringItem,
  circuitItem,
  supportFeeItem,
  licenseItem,
  otherItem,
  recurringLine,
  computeRecurring,
  termTotal,
} from '../lib/recurring';

describe('carrier rate card', () => {
  it('defaults when the team has never saved one; an array (even empty) is the team\'s own card', () => {
    expect(normalizeCarrierCircuits(undefined)).toHaveLength(DEFAULT_CARRIER_CIRCUITS.length);
    expect(normalizeCarrierCircuits(null)[0].carrier).toBe('Segra');
    expect(normalizeCarrierCircuits([])).toEqual([]);
  });
  it('cleans rows and drops blanks', () => {
    const card = normalizeCarrierCircuits([
      { carrier: ' Segra ', bandwidth: '5 Gb', termMonths: '60', mrc: '1695' },
      { carrier: '', bandwidth: '' },
      { carrier: 'Frontier', bandwidth: '1G', termMonths: 0, mrc: -5 },
    ]);
    expect(card).toHaveLength(2);
    expect(card[0]).toMatchObject({ carrier: 'Segra', bandwidth: '5 Gb', termMonths: 60, mrc: 1695 });
    expect(card[1]).toMatchObject({ termMonths: 36, mrc: 0 });
  });
});

describe('items', () => {
  it('normalizes with monthly / flat defaults and never below qty 1', () => {
    const it0 = normalizeRecurringItem({ label: ' Thing ', kind: 'bogus', period: 'week', qty: 0, cost: -1 });
    expect(it0).toMatchObject({ label: 'Thing', kind: 'other', period: 'month', qty: 1, cost: 0, costBasis: 'flat', priceBasis: 'flat', customer: true });
    expect(normalizeRecurring(null)).toEqual({ items: [] });
    expect(normalizeRecurring({ items: [{ id: 'a' }] }).items[0].id).toBe('a');
  });
  it('factories: circuit at retail from the rate card, support fee per unit, annual software', () => {
    const segra = DEFAULT_CARRIER_CIRCUITS.find((c) => c.carrier === 'Segra' && c.bandwidth === '5 Gb');
    const c = circuitItem(segra);
    expect(c).toMatchObject({ kind: 'circuit', carrier: 'Segra', bandwidth: '5 Gb', termMonths: 60, cost: 1695, price: 1695, period: 'month' });
    expect(c.label).toBe('5 Gb fiber circuit — Segra');
    expect(circuitItem(segra, { price: 1895 }).price).toBe(1895);
    const s = supportFeeItem({ cost: 900, pricePerUnit: 4.75 });
    expect(s).toMatchObject({ kind: 'support', cost: 900, costBasis: 'flat', price: 4.75, priceBasis: 'per_unit' });
    const l = licenseItem({ label: 'rXg', annualCost: 12090 });
    expect(l).toMatchObject({ kind: 'license', period: 'year', cost: 12090, price: 12090 });
    expect(otherItem().kind).toBe('other');
    expect(new Set([c.id, s.id, l.id]).size).toBe(3);
  });
});

describe('computeRecurring', () => {
  it('converts annual to monthly, per-unit by the unit count, and totals with margin', () => {
    const r = computeRecurring(
      {
        items: [
          { kind: 'circuit', label: 'Circuit', cost: 1695, price: 1895 },
          { kind: 'support', label: 'Support', cost: 900, price: 4.75, priceBasis: 'per_unit' },
          { kind: 'license', label: 'rXg', period: 'year', cost: 12090, price: 15000 },
          { kind: 'other', label: 'Two of these', qty: 2, cost: 10, price: 25 },
        ],
      },
      { units: 400 }
    );
    expect(r.lines.map((l) => l.monthlyCost)).toEqual([1695, 900, 1007.5, 20]);
    expect(r.lines.map((l) => l.monthlyPrice)).toEqual([1895, 1900, 1250, 50]);
    expect(r.lines[2].annualPrice).toBeCloseTo(15000, 6);
    expect(r.totals.monthlyCost).toBe(3622.5);
    expect(r.totals.monthlyPrice).toBe(5095);
    expect(r.totals.annualPrice).toBe(5095 * 12);
    expect(r.totals.perUnitMonth).toBeCloseTo(12.7375, 6);
    expect(r.totals.grossProfit).toBe(1472.5);
    expect(r.totals.margin).toBeCloseTo(28.9, 1);
    expect(r.hasItems).toBe(true);
  });
  it('per-unit amounts vanish without a unit count; empty input is a zero block', () => {
    const line = recurringLine({ price: 4.75, priceBasis: 'per_unit' }, 0);
    expect(line.monthlyPrice).toBe(0);
    const r = computeRecurring(undefined, { units: 100 });
    expect(r.hasItems).toBe(false);
    expect(r.totals).toMatchObject({ monthlyCost: 0, monthlyPrice: 0, perUnitMonth: 0, margin: 0 });
  });
  it('termTotal', () => {
    expect(termTotal(1695, 60)).toBe(101700);
    expect(termTotal(1695, -3)).toBe(0);
  });
});
