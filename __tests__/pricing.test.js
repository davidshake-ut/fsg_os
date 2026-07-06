import { describe, it, expect } from 'vitest';
import { costFromDiscount, DEFAULT_PRODUCT_LINE_DISCOUNTS } from '../lib/pricing';

describe('costFromDiscount', () => {
  it('applies a discount % off price', () => {
    expect(costFromDiscount(100, 28)).toBe(72);
    expect(costFromDiscount(149, 68)).toBe(47.68);
  });

  it('rounds to 2 decimal places', () => {
    expect(costFromDiscount(174, 60)).toBe(69.6);
  });

  it('treats missing/invalid input as zero', () => {
    expect(costFromDiscount(null, 28)).toBe(0);
    expect(costFromDiscount(100, null)).toBe(100);
    expect(costFromDiscount('abc', 28)).toBe(0);
  });

  it('a 0% discount returns price unchanged', () => {
    expect(costFromDiscount(250, 0)).toBe(250);
  });

  it('a 100% discount returns 0', () => {
    expect(costFromDiscount(250, 100)).toBe(0);
  });
});

describe('DEFAULT_PRODUCT_LINE_DISCOUNTS', () => {
  it('matches the Cambium discount key', () => {
    expect(DEFAULT_PRODUCT_LINE_DISCOUNTS).toMatchObject({
      cnWave: 28,
      Accessories: 28,
      'Cambium Care': 7,
      'Ext. Warranty': 28,
      CnMaestroX: 62,
      Switches: 59,
      "AP's Outdoor": 60,
      "AP's Indoor": 68,
    });
  });
});
