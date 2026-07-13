import { describe, it, expect } from 'vitest';
import {
  computeSmartApartmentLines,
  smartApartmentLaborHours,
  SMART_APARTMENT_DEFAULTS,
} from '../lib/smartApartmentCalc';
import { calculateTechBOM } from '../lib/calculateTechBOM';
import { estimateLaborHours } from '../lib/estimateLaborHours';

const CATALOG = [
  { sku: 'SA-LOCK', desc: 'Smart deadbolt', category: 'Accessories', cost: 120, price: 189, technology: 'smart_apartment' },
  { sku: 'SA-THERM', desc: 'Smart thermostat', category: 'Accessories', cost: 90, price: 149, technology: 'smart_apartment' },
];

describe('smartApartmentCalc', () => {
  it('maps counted devices with a chosen product to priced lines', () => {
    const lines = computeSmartApartmentLines(
      {
        ...SMART_APARTMENT_DEFAULTS,
        smartLocks: 20,
        lockSku: 'SA-LOCK',
        smartThermostats: 10,
        thermostatSku: 'SA-THERM',
      },
      CATALOG
    );
    expect(lines).toHaveLength(2);
    const lock = lines.find((l) => l.sku === 'SA-LOCK');
    expect(lock.qty).toBe(20);
    expect(lock.cost).toBe(120);
    expect(lock.price).toBe(189);
  });

  it('skips zero counts, unselected products, and unknown SKUs', () => {
    const lines = computeSmartApartmentLines(
      {
        ...SMART_APARTMENT_DEFAULTS,
        smartLocks: 0,
        lockSku: 'SA-LOCK', // count 0 → no line
        leakDetectors: 5, // no product chosen → no line (labor still counts)
        smartLights: 3,
        lightSku: 'REMOVED-SKU', // product gone from catalog → no line
      },
      CATALOG
    );
    expect(lines).toHaveLength(0);
  });

  it('labor per spec: locks 1.0, thermostats 0.75, leak 0.5, lights 0.5 hr each', () => {
    const hours = smartApartmentLaborHours({
      smartLocks: 10,
      smartThermostats: 4,
      leakDetectors: 6,
      smartLights: 8,
    });
    expect(hours['install-tech']).toBe(10 * 1 + 4 * 0.75 + 6 * 0.5 + 8 * 0.5); // 20
  });

  it('electrician toggle removes only the lights labor', () => {
    const hours = smartApartmentLaborHours({
      smartLocks: 10,
      smartLights: 8,
      lightsInstalledByOthers: true,
    });
    expect(hours['install-tech']).toBe(10);
  });

  it('rolls into the tech BOM and the labor estimate end to end', () => {
    const value = { ...SMART_APARTMENT_DEFAULTS, smartLocks: 20, lockSku: 'SA-LOCK' };
    const lines = computeSmartApartmentLines(value, CATALOG).map((l) => ({
      ...l,
      system: 'smart_apartment',
      fromCalculator: true,
    }));
    const bom = calculateTechBOM('smart_apartment', lines);
    expect(bom.grandTotalPrice).toBe(20 * 189);
    expect(bom.items[0].fromCalculator).toBe(true);

    const est = estimateLaborHours({ techContributions: [smartApartmentLaborHours(value)] });
    expect(est['install-tech']).toBe(20);
    expect(est['project-manager']).toBe(0); // no invented PM baseline for this tech
  });
});
