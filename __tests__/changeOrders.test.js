import { describe, it, expect } from 'vitest';
import { computeCoTotals } from '../lib/changeOrders';

describe('computeCoTotals', () => {
  it('computes line totals and subtotal from qty × unit_price', () => {
    const { line_items, subtotal } = computeCoTotals([
      { description: 'Camera', qty: 6, unit_price: 174 },
      { description: 'Labor', qty: 8, unit_price: 125 },
    ]);
    expect(line_items[0].total).toBe(1044);
    expect(line_items[1].total).toBe(1000);
    expect(subtotal).toBe(2044);
  });

  it('coerces bad input to zero instead of NaN', () => {
    const { line_items, subtotal } = computeCoTotals([
      { description: 'Broken', qty: 'abc', unit_price: null },
    ]);
    expect(line_items[0].total).toBe(0);
    expect(subtotal).toBe(0);
  });

  it('rounds money to 2 decimal places', () => {
    const { subtotal } = computeCoTotals([{ description: 'x', qty: 3, unit_price: 0.1 }]);
    expect(subtotal).toBe(0.3);
  });

  it('handles empty or non-array input', () => {
    expect(computeCoTotals([]).subtotal).toBe(0);
    expect(computeCoTotals(null).subtotal).toBe(0);
  });
});
