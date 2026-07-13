import { describe, it, expect } from 'vitest';
import { calculateTechBOM } from '../lib/calculateTechBOM';

const line = (over = {}) => ({
  id: 'l1',
  system: 'access_control',
  sku: 'AC-100',
  description: 'Door controller',
  qty: 2,
  cost: 100,
  price: 150,
  ...over,
});

describe('calculateTechBOM', () => {
  it('only counts lines for the requested technology', () => {
    const bom = calculateTechBOM('access_control', [
      line(),
      line({ id: 'l2', system: 'ev_charging', sku: 'EV-1' }),
    ]);
    expect(bom.items).toHaveLength(1);
    expect(bom.items[0].sku).toBe('AC-100');
    expect(bom.grandTotalPrice).toBe(300);
    expect(bom.grandTotalCost).toBe(200);
  });

  it('splits services from hardware and prices them without shipping', () => {
    const bom = calculateTechBOM(
      'access_control',
      [
        line(), // hardware: 2 × $150 = $300
        line({ id: 'l2', sku: 'SVC-1', description: 'Commissioning', category: 'Service', qty: 4, cost: 50, price: 100 }),
      ],
      { includeShipping: true, shippingPercent: 10 }
    );
    expect(bom.items).toHaveLength(1);
    expect(bom.serviceItems).toHaveLength(1);
    expect(bom.totalServicesPrice).toBe(400);
    expect(bom.shippingPrice).toBe(30); // 10% of hardware only
    expect(bom.grandTotalPrice).toBe(300 + 400 + 30);
  });

  it('marks calculator-derived lines; hand-added lines stay custom', () => {
    const bom = calculateTechBOM('access_control', [
      line({ fromCalculator: true }),
      line({ id: 'l2', sku: 'CUSTOM-1' }),
    ]);
    const calc = bom.items.find((i) => i.sku === 'AC-100');
    const custom = bom.items.find((i) => i.sku === 'CUSTOM-1');
    expect(calc.fromCalculator).toBe(true);
    expect(calc.isCustomLine).toBe(false);
    expect(custom.fromCalculator).toBe(false);
    expect(custom.isCustomLine).toBe(true);
  });

  it('drops zero- and blank-quantity lines', () => {
    const bom = calculateTechBOM('access_control', [
      line({ qty: 0 }),
      line({ id: 'l2', qty: '' }),
    ]);
    expect(bom.items).toHaveLength(0);
    expect(bom.grandTotalPrice).toBe(0);
  });
});
