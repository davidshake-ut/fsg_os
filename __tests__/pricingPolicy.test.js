import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MARKUP_BY_CATEGORY,
  DEFAULT_PRICING_POLICY,
  normalizePricingPolicy,
  resolvePricingPolicy,
  markupFor,
  priceWithMarkup,
  applyPricingPolicy,
  inheritedPrice,
} from '../lib/pricingPolicy';
import { mergeProducts } from '../lib/mergeProducts';
import { rollUpAssemblies } from '../lib/assemblies';

describe('policy shape', () => {
  it('defaults are the locked markups with cabling and services on list price', () => {
    expect(DEFAULT_PRICING_POLICY.mode).toBe('catalog');
    expect(DEFAULT_MARKUP_BY_CATEGORY).toMatchObject({ Gateway: 25, 'Aggregate Switch': 25, 'Access Point': 40, Switch: 50, 'Fiber Module': 60, Rack: 25, Miscellaneous: 25, Enclosure: 40, Cabling: null, Service: null });
  });

  it('normalizes: bad mode → catalog, blank markup → list price, unknown categories kept', () => {
    const p = normalizePricingPolicy({ mode: 'weird', defaultMarkupPct: '30', markupByCategory: { Switch: '55', UPS: '', Widget: 10, ' ': 5 } });
    expect(p.mode).toBe('catalog');
    expect(p.defaultMarkupPct).toBe(30);
    expect(p.markupByCategory.Switch).toBe(55);
    expect(p.markupByCategory.UPS).toBeNull();
    expect(p.markupByCategory.Widget).toBe(10);
    expect(p.markupByCategory['Access Point']).toBe(40);
    expect(normalizePricingPolicy(undefined)).toEqual({ mode: 'catalog', defaultMarkupPct: 25, markupByCategory: DEFAULT_MARKUP_BY_CATEGORY });
  });

  it('resolve: the quote may pick the mode; markups stay the team\'s', () => {
    const settings = { pricingPolicy: { mode: 'costPlus', markupByCategory: { Switch: 45 } } };
    expect(resolvePricingPolicy(settings, null).mode).toBe('costPlus');
    expect(resolvePricingPolicy(settings, { mode: 'catalog' }).mode).toBe('catalog');
    expect(resolvePricingPolicy(settings, { mode: 'catalog', markupByCategory: { Switch: 99 } }).markupByCategory.Switch).toBe(45);
    expect(resolvePricingPolicy(undefined, { mode: 'costPlus' }).mode).toBe('costPlus');
  });

  it('markupFor uses the category, else the default, and null means list price', () => {
    const p = normalizePricingPolicy({ defaultMarkupPct: 33 });
    expect(markupFor(p, 'Access Point')).toBe(40);
    expect(markupFor(p, 'Cabling')).toBeNull();
    expect(markupFor(p, 'Made Up')).toBe(33);
    expect(priceWithMarkup(418.98, 40)).toBeCloseTo(586.572, 9); // no rounding — totals must extend like a sheet
  });
});

describe('applyPricingPolicy', () => {
  const products = [
    { sku: 'AP', category: 'Access Point', cost: 100, price: 250 },
    { sku: 'RUN', category: 'Cabling', cost: 125, price: 275 },
    { sku: 'KIT', category: 'Rack', cost: 0, price: 0, components: [{ sku: 'PART', qty: 2 }] },
    { sku: 'PART', category: 'Rack Accessory', cost: 40, price: 80 },
  ];

  it('catalog mode returns the same array', () => {
    expect(applyPricingPolicy(products, normalizePricingPolicy({ mode: 'catalog' }))).toBe(products);
  });

  it('cost-plus re-prices from cost by category, keeps list price alongside, leaves null categories on list', () => {
    const priced = applyPricingPolicy(rollUpAssemblies(products), normalizePricingPolicy({ mode: 'costPlus' }));
    const by = Object.fromEntries(priced.map((p) => [p.sku, p]));
    expect(by.AP).toMatchObject({ price: 140, listPrice: 250, policyMode: 'costPlus', policyMarkupPct: 40 });
    expect(by.RUN).toMatchObject({ price: 275, listPrice: 275, policyMarkupPct: null });
    expect(by.PART.price).toBe(50);
    // A kit prices as a whole: rolled-up cost × its own category's markup, not Σ part prices.
    expect(by.KIT).toMatchObject({ cost: 80, price: 100, policyMarkupPct: 25 });
  });

  it('inheritedPrice: a linked license sells at its device\'s markup only under cost-plus', () => {
    const priced = applyPricingPolicy(products, normalizePricingPolicy({ mode: 'costPlus' }));
    const ap = priced.find((p) => p.sku === 'AP');
    expect(inheritedPrice(ap, 179.06)).toBeCloseTo(179.06 * 1.4, 9);
    expect(inheritedPrice(priced.find((p) => p.sku === 'RUN'), 10)).toBeNull();
    expect(inheritedPrice(products[0], 10)).toBeNull();
    expect(inheritedPrice(null, 10)).toBeNull();
  });

  it('the seeded telecom-room kits price at the rack markup under cost-plus', () => {
    const priced = applyPricingPolicy(rollUpAssemblies(mergeProducts([])), normalizePricingPolicy({ mode: 'costPlus' }));
    const idf = priced.find((p) => p.sku === 'KIT-IDF-12U');
    expect(idf.price).toBeCloseTo(2940.32 * 1.25, 6);
    const panel = priced.find((p) => p.sku === 'KIT-MEDIA-PANEL');
    expect(panel.price).toBeCloseTo(179.77 * 1.4, 6); // Enclosure 40% — the workbook's media-panel sell price
  });
});
