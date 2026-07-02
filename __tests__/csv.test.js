import { describe, it, expect } from 'vitest';
import { parseCSV, parseCatalogCSV } from '../lib/csv';

describe('parseCSV', () => {
  it('parses quoted fields with commas and escaped quotes', () => {
    const rows = parseCSV('a,b\r\n"x,y","he said ""hi"""\n');
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['x,y', 'he said "hi"']);
  });

  it('strips a leading BOM', () => {
    const rows = parseCSV('﻿SKU,Price\nA,1\n');
    expect(rows[0]).toEqual(['SKU', 'Price']);
  });
});

describe('parseCatalogCSV — canonical template', () => {
  const csv = ['SKU,Description,Category,Cost,Price', 'CAM-X,Test Cam,Camera,100,250'].join('\n');
  it('maps columns and numbers', () => {
    const { products, errors } = parseCatalogCSV(csv);
    expect(errors).toEqual([]);
    expect(products).toEqual([
      { sku: 'CAM-X', description: 'Test Cam', category: 'Camera', cost: 100, price: 250, vendor: '', preferred_vendor: '' },
    ]);
  });
});

describe('parseCatalogCSV — tolerant of other formats', () => {
  it('accepts the vendor sheet (Our Cost / Sell Price with $)', () => {
    const csv = [
      'SKU,Description,Category,Our Cost,Sell Price',
      'AP-1,"Indoor AP, ceiling",Access Point,"$98.94","$149.00"',
    ].join('\n');
    const { products } = parseCatalogCSV(csv);
    expect(products[0]).toMatchObject({ cost: 98.94, price: 149, category: 'Access Point' });
    expect(products[0].description).toBe('Indoor AP, ceiling');
  });

  it('defaults cost to price when no cost column is present', () => {
    const csv = ['SKU,Description,Category,Unit Price', 'X,Thing,Cable,4'].join('\n');
    const { products } = parseCatalogCSV(csv);
    expect(products[0]).toMatchObject({ price: 4, cost: 4 });
  });

  it('reports missing required columns', () => {
    const { products, errors } = parseCatalogCSV('Foo,Bar\n1,2');
    expect(products).toEqual([]);
    expect(errors.join(' ')).toMatch(/SKU/);
  });

  it('skips section/blank rows and invalid-price rows', () => {
    const csv = [
      'SKU,Description,Category,Price',
      ',,,', // blank
      'Gateway,,,', // section header (no desc/price)
      'OK-1,Good,Gateway,100',
    ].join('\n');
    const { products, errors } = parseCatalogCSV(csv);
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe('OK-1');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
