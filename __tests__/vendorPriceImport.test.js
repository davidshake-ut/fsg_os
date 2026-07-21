import { describe, it, expect } from 'vitest';
import { parseVendorPriceList, matchVendorRows, readVendorPriceFile, resolveImportCost } from '../lib/vendorPriceImport';

describe('parseVendorPriceList', () => {
  it('parses SKU + Price with no other columns', () => {
    const csv = ['SKU,Price', 'XV2-21X,149.00', 'MX-EX2028PxA-U,895'].join('\n');
    const { rows, errors } = parseVendorPriceList(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { sku: 'XV2-21X', price: 149, cost: null, discount: null, productLine: '', description: '' },
      { sku: 'MX-EX2028PxA-U', price: 895, cost: null, discount: null, productLine: '', description: '' },
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
      cost: null,
      discount: null,
      productLine: "AP's Outdoor",
      description: 'Cambium XV3-23T Outdoor AP',
    });
  });

  it('reads Cost and Discount columns; blank/invalid cells are null, not errors', () => {
    const csv = [
      'SKU,List Price,Net Price,Discount %',
      'A,100,60,40',
      'B,200,,35',
      'C,300,not-a-number,',
    ].join('\n');
    const { rows, errors } = parseVendorPriceList(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.sku, r.cost, r.discount])).toEqual([
      ['A', 60, 40],
      ['B', null, 35],
      ['C', null, null],
    ]);
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

  it('an explicit mapping reads columns no alias would recognize', () => {
    const csv = ['Item Code,Widget Name,MSRP ($USD)', 'XV2-21X,Indoor AP,"$149.00"'].join('\n');
    // Auto-detect alone can't find these headers…
    expect(parseVendorPriceList(csv).errors.length).toBeGreaterThan(0);
    // …but a user mapping makes them work without renaming anything.
    const { rows, errors } = parseVendorPriceList(csv, { sku: 0, price: 2, productLine: -1, description: 1 });
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ sku: 'XV2-21X', price: 149, cost: null, discount: null, productLine: '', description: 'Indoor AP' }]);
  });

  it('an explicit mapping overrides the auto-guess', () => {
    // Both "SKU" and "Model" exist; the user says Model is the real key.
    const csv = ['SKU,Model,Price', 'INTERNAL-1,XV2-21X,149'].join('\n');
    const { rows } = parseVendorPriceList(csv, { sku: 1, price: 2, productLine: -1, description: -1 });
    expect(rows[0].sku).toBe('XV2-21X');
  });
});

describe('readVendorPriceFile', () => {
  it('returns header, sample rows, and an auto-guessed mapping', () => {
    const csv = [
      'Part Number,Description,Product Family,List Price',
      'XV3-23T,Outdoor AP,APs,499',
      'XV2-21X,Indoor AP,APs,149',
    ].join('\n');
    const { error, header, sampleRows, guess } = readVendorPriceFile(csv);
    expect(error).toBeNull();
    expect(header).toEqual(['Part Number', 'Description', 'Product Family', 'List Price']);
    expect(sampleRows).toHaveLength(2);
    expect(guess).toEqual({ sku: 0, price: 3, cost: -1, discount: -1, productLine: 2, description: 1 });
  });

  it('unrecognized headers guess -1 instead of erroring (the mapping UI takes over)', () => {
    const { error, guess } = readVendorPriceFile('Item Code,MSRP ($USD)\nA,10');
    expect(error).toBeNull();
    expect(guess).toEqual({ sku: -1, price: -1, cost: -1, discount: -1, productLine: -1, description: -1 });
  });

  it('errors only on an empty file', () => {
    expect(readVendorPriceFile('').error).toBeTruthy();
  });
});

describe('resolveImportCost', () => {
  const opts = { productLine: 'Switches', productLineDiscounts: { Switches: 20 }, fallback: 55 };

  it('an explicit Cost column wins over everything', () => {
    expect(resolveImportCost({ price: 100, cost: 62, discount: 40 }, opts)).toEqual({ cost: 62, fromFile: true });
  });

  it('a Discount % column computes cost off Price when Cost is absent', () => {
    expect(resolveImportCost({ price: 100, cost: null, discount: 40 }, opts)).toEqual({ cost: 60, fromFile: true });
  });

  it('falls back to the Product Line discount, then the fallback', () => {
    expect(resolveImportCost({ price: 100, cost: null, discount: null }, opts)).toEqual({ cost: 80, fromFile: false });
    expect(resolveImportCost({ price: 100, cost: null, discount: null }, { fallback: 55 })).toEqual({ cost: 55, fromFile: false });
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
