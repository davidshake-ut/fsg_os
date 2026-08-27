import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FINANCING,
  normalizeFinancing,
  normalizeTerms,
  resolveFinancing,
  monthlyPayment,
  paymentFactor,
  upliftFor,
  principalFor,
  computeFinancing,
} from '../lib/financing';

describe('normalizeFinancing / resolveFinancing', () => {
  it('fills every missing field from the defaults and cleans terms', () => {
    expect(normalizeFinancing(undefined)).toEqual(DEFAULT_FINANCING);
    expect(normalizeTerms(['60', 36, 36, 0, -1, 999])).toEqual([36, 60]);
    expect(normalizeFinancing({ terms: [] }).terms).toEqual([36, 60]);
    expect(normalizeFinancing({ apr: '9.5', lenderDiscountPct: 120, basis: 'nope', enabled: 'yes' })).toMatchObject({
      apr: 9.5,
      lenderDiscountPct: 95,
      basis: 'total',
      enabled: false,
    });
  });
  it('the quote overrides the team, the team overrides the defaults', () => {
    const settings = { financing: { apr: 8, terms: [24, 48], lenderDiscountPct: 10, enabled: true } };
    expect(resolveFinancing(settings, null)).toMatchObject({ apr: 8, terms: [24, 48], lenderDiscountPct: 10, enabled: true });
    expect(resolveFinancing(settings, { apr: 12, enabled: false })).toMatchObject({ apr: 12, terms: [24, 48], lenderDiscountPct: 10, enabled: false });
    expect(resolveFinancing({}, { terms: [60] })).toMatchObject({ apr: 12, terms: [60], enabled: false });
  });
});

describe('payments', () => {
  it('amortizes at the annual rate (100,000 over 60 months at 12% is $2,224.44)', () => {
    expect(monthlyPayment(100000, 60, 12)).toBeCloseTo(2224.44, 2);
    expect(monthlyPayment(100000, 36, 12)).toBeCloseTo(3321.43, 2);
    expect(paymentFactor(60, 12)).toBeCloseTo(0.0222444, 6);
  });
  it('0% divides evenly; nothing to finance pays nothing', () => {
    expect(monthlyPayment(12000, 12, 0)).toBe(1000);
    expect(monthlyPayment(0, 60, 12)).toBe(0);
  });
  it('uplift nets the cash price after the lender discount', () => {
    const P = 1000;
    const u = upliftFor(P, 12);
    expect((P + u) * 0.88).toBeCloseTo(P, 9);
    expect(upliftFor(P, 0)).toBe(0);
  });
});

describe('computeFinancing', () => {
  const summary = { hardware: { price: 600 }, labor: { price: 200 }, cabling: { price: 200 }, total: { price: 1000 } };
  it('one option per term on the uplifted price, with the per-unit figure', () => {
    const fin = computeFinancing({ enabled: true, apr: 12, terms: [60, 36], lenderDiscountPct: 12 }, { principal: 100000, units: 50 });
    expect(fin.enabled).toBe(true);
    expect(fin.uplift).toBeCloseTo(13636.36, 2);
    expect(fin.financedPrice).toBeCloseTo(113636.36, 2);
    expect(fin.options.map((o) => o.months)).toEqual([36, 60]);
    const sixty = fin.options.find((o) => o.months === 60);
    expect(sixty.monthly).toBeCloseTo(monthlyPayment(113636.36, 60, 12), 1);
    expect(sixty.total).toBeCloseTo(sixty.monthly * 60, 6);
    expect(sixty.financeCharge).toBeCloseTo(sixty.total - fin.financedPrice, 6);
    expect(sixty.perUnitMonth).toBeCloseTo(sixty.monthly / 50, 9);
  });
  it('principal follows the basis', () => {
    expect(principalFor({ basis: 'total' }, summary)).toBe(1000);
    expect(principalFor({ basis: 'managedWifi' }, summary)).toBe(800);
    expect(principalFor(null, summary)).toBe(1000);
  });
});
