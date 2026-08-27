import { describe, it, expect } from 'vitest';
import { isAssembly, normalizeComponents, productsBySku, assemblyRollUp, rollUpAssemblies, explodeAssembly } from '../lib/assemblies';
import { BASE_PRODUCTS } from '../lib/catalog';
import { mergeProducts } from '../lib/mergeProducts';
import { MUZE } from './fixtures/muze';

const parts = [
  { sku: 'RACK', desc: 'Rack', category: 'Rack', cost: 200, price: 250 },
  { sku: 'PANEL', desc: 'Panel', category: 'Rack Accessory', cost: 35, price: 43.75 },
  { sku: 'UPS', desc: 'UPS', category: 'UPS', cost: 1000, price: 1250 },
];

describe('normalizeComponents', () => {
  it('cleans skus and quantities, keeps pins, drops junk, and returns null when empty', () => {
    expect(normalizeComponents(null)).toBeNull();
    expect(normalizeComponents([])).toBeNull();
    expect(normalizeComponents([{ sku: ' ', qty: 1 }, { sku: 'A', qty: 0 }, { sku: 'B', qty: 'x' }])).toBeNull();
    expect(normalizeComponents([{ sku: ' RACK ', qty: '2' }, { sku: 'PANEL', qty: 3, unitCost: '65.99', unitPrice: '', note: 'MDF price' }])).toEqual([
      { sku: 'RACK', qty: 2 },
      { sku: 'PANEL', qty: 3, unitCost: 65.99, note: 'MDF price' },
    ]);
  });
});

describe('assemblyRollUp', () => {
  const bySku = productsBySku(parts);

  it('sums qty × catalog cost / price and resolves the parts', () => {
    const r = assemblyRollUp([{ sku: 'RACK', qty: 1 }, { sku: 'PANEL', qty: 2 }, { sku: 'UPS', qty: 1 }], bySku);
    expect(r.cost).toBe(1270);
    expect(r.price).toBe(1587.5);
    expect(r.missing).toEqual([]);
    expect(r.resolved[1]).toMatchObject({ sku: 'PANEL', qty: 2, desc: 'Panel', unitCost: 35, unitPrice: 43.75, totalCost: 70, totalPrice: 87.5, pinned: false });
  });

  it('a pinned cost keeps the part\'s markup unless the price is pinned too; missing parts are flagged', () => {
    const r = assemblyRollUp([{ sku: 'PANEL', qty: 3, unitCost: 65.99 }, { sku: 'GHOST', qty: 1 }, { sku: 'GONE', qty: 2, unitCost: 10, unitPrice: 12 }], bySku);
    expect(r.resolved[0]).toMatchObject({ unitCost: 65.99, unitPrice: 82.49, totalCost: 197.97, pinned: true });
    expect(r.missing).toEqual(['GHOST']);
    expect(r.resolved[1]).toMatchObject({ missing: true, unitCost: 0, unitPrice: 0 });
    expect(r.resolved[2]).toMatchObject({ missing: true, unitCost: 10, unitPrice: 12, totalCost: 20, totalPrice: 24 });
    expect(r.cost).toBe(217.97);
  });
});

describe('rollUpAssemblies', () => {
  it('replaces kit cost / price, leaves plain products as the same objects, and prices a kit of kits', () => {
    const kitA = { sku: 'KIT-A', desc: 'A', category: 'Rack', cost: 0, price: 0, components: [{ sku: 'RACK', qty: 1 }, { sku: 'PANEL', qty: 2 }] };
    const kitB = { sku: 'KIT-B', desc: 'B', category: 'Rack', cost: 0, price: 0, components: [{ sku: 'KIT-A', qty: 2 }, { sku: 'UPS', qty: 1 }] };
    const out = rollUpAssemblies([...parts, kitB, kitA]);
    expect(out[0]).toBe(parts[0]);
    const a = out.find((p) => p.sku === 'KIT-A');
    const b = out.find((p) => p.sku === 'KIT-B');
    expect(a).toMatchObject({ isAssembly: true, cost: 270, price: 337.5 });
    expect(a.componentsResolved).toHaveLength(2);
    expect(b).toMatchObject({ isAssembly: true, cost: 2 * 270 + 1000, price: 2 * 337.5 + 1250 });
    expect(isAssembly(a)).toBe(true);
    expect(isAssembly(parts[0])).toBe(false);
  });

  it('a cycle terminates', () => {
    const x = { sku: 'X', desc: 'x', category: 'Rack', cost: 1, price: 2, components: [{ sku: 'Y', qty: 1 }] };
    const y = { sku: 'Y', desc: 'y', category: 'Rack', cost: 1, price: 2, components: [{ sku: 'X', qty: 1 }] };
    expect(() => rollUpAssemblies([x, y])).not.toThrow();
  });

  it('a display alias still resolves a component by its base sku', () => {
    const aliased = { ...parts[0], sku: 'FSG-RACK', baseSku: 'RACK' };
    const kit = { sku: 'KIT', desc: 'k', category: 'Rack', cost: 0, price: 0, components: [{ sku: 'RACK', qty: 1 }] };
    const out = rollUpAssemblies([aliased, kit]);
    expect(out.find((p) => p.sku === 'KIT').cost).toBe(200);
  });
});

describe('the seeded telecom-room kits match the Muze rack schedule', () => {
  const rolled = rollUpAssemblies(mergeProducts([]));
  const kit = (sku) => rolled.find((p) => p.sku === sku);
  it.each([
    ['KIT-IDF-12U', 'idf-12u'],
    ['KIT-MDF-22U', 'mdf-22u'],
    ['KIT-IDF-12U-FTTU', 'idf-12u-fttu'],
    ['KIT-MDF-22U-FTTU', 'mdf-22u-fttu'],
    ['KIT-MEDIA-PANEL', 'media-panel'],
  ])('%s rolls up to the workbook subtotal', (sku, key) => {
    const p = kit(sku);
    expect(p).toBeTruthy();
    expect(p.technology).toBe('digital_infrastructure');
    expect(p.assemblyMissing).toEqual([]);
    expect(p.cost).toBeCloseTo(MUZE.kits.find((k) => k.key === key).expectedCost, 2);
    expect(p.price).toBeGreaterThan(p.cost);
  });

  it('kits are vendor-neutral and every part is a base product', () => {
    const skus = new Set(BASE_PRODUCTS.map((p) => p.sku));
    for (const p of rolled.filter(isAssembly)) {
      expect(p.vendor).toBe('');
      for (const c of p.components) expect(skus.has(c.sku)).toBe(true);
    }
  });

  it('explodeAssembly lists the parts scaled by the line quantity', () => {
    const lines = explodeAssembly(kit('KIT-IDF-12U'), 18);
    expect(lines.find((l) => l.sku === 'SMT2200CUS')).toMatchObject({ qty: 18, cost: 1750, fromKit: 'KIT-IDF-12U' });
    expect(lines.find((l) => l.sku === '125-0946-WT').qty).toBe(52 * 18);
  });
});
