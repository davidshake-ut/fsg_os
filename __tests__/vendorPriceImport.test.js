import { describe, it, expect } from 'vitest';
import { parseVendorPriceList, matchVendorRows } from '../lib/vendorPriceImport';

describe('parseVendorPriceList', () => {
  it('parses SKU + Price with no other columns', () => {
    const csv = ['SKU,Price', 'XV2-21X,149.00', 'MX-EX2028PxA-U,895'].join('\n');
    const { rows, errors } = parseVendorPriceList(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { sku: 'XV2-21X', price: 149, productLine: '', description: '' },
      { sku: 'MX-EX2028PxA-U', price: 895, productLine: '', description: '' },
    ]);
  });

  it('tolerates vendor naming: Part Number / List Price / Product Family', () => {
    const csv = [
      'Part Number,Description,Product Family,List Price',
      'XV3-23T,Cambium XV3-23T Outdoor AP,AP\'s Outdoor,"$499.00"',
    ].join('\n');
    const { rows, errors } = parseVendorPriceList(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      sku: 'XV3-23T',
      price: 499,
      productLine: "AP's Outdoor",
      description: 'Cambium XV3-23T Outdoor AP',
    });
  });

  it('errors when SKU or Price columns are missing', () => {
    const { rows, errors } = parseVendorPriceList('Description,Cost\nFoo,10');
    expect(rows).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips rows with invalid price but keeps parsing', () => {
    const csv = ['SKU,Price', 'A,10', 'B,not-a-number', 'C,20'].join('\n');
    const { rows, errors } = parseVendorPriceList(csv);
    expect(rows.map((r) => r.sku)).toEqual(['A', 'C']);
    expect(errors.length).toBe(1);
  });
});

describe('matchVendorRows', () => {
  const catalog = [
    { sku: 'XV2-21X', desc: 'Indoor AP', category: 'Access Point' },
    { sku: 'MX-EX2028PxA-U', desc: 'Switch', category: 'Switch' },
  ];

  it('matches by SKU case/space-insensitively and separates unmatched rows', () => {
    const vendorRows = [
      { sku: ' xv2-21x ', price: 150, productLine: '', description: '' },
      { sku: 'NOT-IN-CATALOG', price: 10, productLine: '', description: '' },
    ];
    const { matched, unmatched } = matchVendorRows(vendorRows, catalog);
    expect(matched).toHaveLength(1);
    expect(matched[0].existing.sku).toBe('XV2-21X');
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].sku).toBe('NOT-IN-CATALOG');
  });
});
