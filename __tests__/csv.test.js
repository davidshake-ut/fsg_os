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
  it('maps columns and numbers — vendor keys OMITTED when the columns are absent', () => {
    const { products, errors } = parseCatalogCSV(csv);
    expect(errors).toEqual([]);
    expect(products).toEqual([
      { sku: 'CAM-X', description: 'Test Cam', category: 'Camera', cost: 100, price: 250 },
    ]);
    // The preserve-guards depend on the keys not existing at all:
    expect('vendor' in products[0]).toBe(false);
    expect('preferred_vendor' in products[0]).toBe(false);
  });

  it('parses Vendor and Source / Distributor headers (and legacy aliases)', () => {
    const modern = [
      'SKU,Description,Category,Price,Vendor,Source / Distributor',
      'AP-9,Thing,Access Point,100,Ruckus,ScanSource',
    ].join('\n');
    expect(parseCatalogCSV(modern).products[0]).toMatchObject({
      vendor: 'Ruckus',
      preferred_vendor: 'ScanSource',
    });

    const legacy = [
      'SKU,Description,Category,Price,Manufacturer,Preferred Vendor',
      'AP-9,Thing,Access Point,100,Cambium Networks,Anixter',
    ].join('\n');
    expect(parseCatalogCSV(legacy).products[0]).toMatchObject({
      vendor: 'Cambium Networks',
      preferred_vendor: 'Anixter',
    });
  });

  it('a present-but-empty vendor cell still sends "" so intentional clearing works', () => {
    const csv = ['SKU,Description,Category,Price,Vendor', 'AP-9,Thing,Access Point,100,'].join('\n');
    const { products } = parseCatalogCSV(csv);
    expect(products[0].vendor).toBe('');
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
