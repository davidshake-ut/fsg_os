import { describe, it, expect } from 'vitest';
import {
  hasContent,
  isAlternate,
  primarySections,
  optionLetter,
  optionTags,
  optionTitle,
  optionGroups,
  comparisonRows,
  customerComparisonRows,
  signed,
} from '../lib/vendorComparison';

const bom = (o = {}) => ({
  items: [{ sku: 'X', qty: 1, unitPrice: 100, totalPrice: 100 }],
  serviceItems: [],
  totalHardwarePrice: 1000,
  totalServicesPrice: 0,
  shippingPrice: 70,
  grandTotalPrice: 1070,
  grandTotalCost: 800,
  ...o,
});
const section = (o = {}) => ({ title: 'Managed Wi-Fi', label: 'Managed Wi-Fi', bom: bom(), ...o });
const grouped = (o) => section({ optionGroup: 'managed_wifi', techLabel: 'Managed Wi-Fi', ...o });

const A = grouped({ title: 'Managed Wi-Fi — Cambium Networks', label: 'Wi-Fi', isPrimary: true, vendorId: 'vnd_a', vendorName: 'Cambium Networks' });
const B = grouped({
  title: 'Managed Wi-Fi — Ruckus',
  isPrimary: false,
  vendorId: 'vnd_b',
  vendorName: 'Ruckus',
  bom: bom({ totalHardwarePrice: 1200, shippingPrice: 84, grandTotalPrice: 1284, grandTotalCost: 900 }),
});
const C = grouped({ title: 'Managed Wi-Fi — Aruba', isPrimary: false, vendorId: 'vnd_c', vendorName: 'Aruba' });
const plain = section({ title: 'Video Surveillance', label: 'Camera' });
const labor = { title: 'Professional Labor', label: 'Labor', isLabor: true, bom: bom({ items: [], serviceItems: [{ sku: 'L' }] }) };

describe('section predicates', () => {
  it('isAlternate is true only for an explicit non-primary option section', () => {
    expect(isAlternate(B)).toBe(true);
    expect(isAlternate(A)).toBe(false);
    expect(isAlternate(plain)).toBe(false);
    expect(isAlternate({ optionGroup: 'x', bom: bom() })).toBe(false); // isPrimary undefined → counts
    expect(isAlternate(null)).toBe(false);
  });

  it('primarySections drops alternates and nothing else', () => {
    expect(primarySections([A, B, plain, labor])).toEqual([A, plain, labor]);
    expect(primarySections(undefined)).toEqual([]);
  });

  it('hasContent needs hardware or services', () => {
    expect(hasContent(A)).toBe(true);
    expect(hasContent(labor)).toBe(true);
    expect(hasContent({ bom: { items: [], serviceItems: [] } })).toBe(false);
    expect(hasContent({})).toBe(false);
  });

  it('optionLetter clamps to A–Z', () => {
    expect([0, 1, 2, 25, 30, -1].map(optionLetter)).toEqual(['A', 'B', 'C', 'Z', 'Z', 'A']);
  });
});

describe('optionTags / optionTitle', () => {
  it('primary is A, alternates count up from B, plain sections untagged', () => {
    const tags = optionTags([A, B, C, plain, labor]);
    expect(tags.get(A)).toEqual({ letter: 'A', isPrimary: true, groupLabel: 'Managed Wi-Fi' });
    expect(tags.get(B)).toEqual({ letter: 'B', isPrimary: false, groupLabel: 'Managed Wi-Fi' });
    expect(tags.get(C).letter).toBe('C');
    expect(tags.has(plain)).toBe(false);
    expect(tags.has(labor)).toBe(false);
  });

  it('an alternate stays B even when Option A is absent or listed after it', () => {
    expect(optionTags([B]).get(B).letter).toBe('B');
    const tags = optionTags([B, A]);
    expect(tags.get(B).letter).toBe('B');
    expect(tags.get(A).letter).toBe('A');
  });

  it('groupLabel prefers techLabel over the engine section label', () => {
    expect(optionTags([A]).get(A).groupLabel).toBe('Managed Wi-Fi');
    const noTechLabel = { ...A, techLabel: undefined };
    expect(optionTags([noTechLabel]).get(noTechLabel).groupLabel).toBe('Wi-Fi');
  });

  it('optionTitle tags grouped sections and leaves plain ones alone', () => {
    const tags = optionTags([A, B, plain]);
    expect(optionTitle(A, tags)).toBe('Option A — Managed Wi-Fi — Cambium Networks');
    expect(optionTitle(B, tags)).toBe('Option B (Alternate) — Managed Wi-Fi — Ruckus');
    expect(optionTitle(plain, tags)).toBe('Video Surveillance');
  });
});

describe('optionGroups', () => {
  it('groups a technology with ≥2 present options, primary first', () => {
    const groups = optionGroups([B, A, plain, labor]);
    expect(groups).toHaveLength(1);
    expect(groups[0].techId).toBe('managed_wifi');
    expect(groups[0].label).toBe('Managed Wi-Fi');
    expect(groups[0].options.map((o) => [o.letter, o.isPrimary, o.vendorName])).toEqual([
      ['A', true, 'Cambium Networks'],
      ['B', false, 'Ruckus'],
    ]);
    expect(groups[0].options[0].section).toBe(A);
  });

  it('needs two options WITH content — an empty alternate makes no group', () => {
    const emptyB = { ...B, bom: bom({ items: [], serviceItems: [] }) };
    expect(optionGroups([A, emptyB])).toEqual([]);
    expect(optionGroups([A, plain, labor])).toEqual([]);
  });

  it('keeps letters ordered with three vendors', () => {
    expect(optionGroups([A, B, C])[0].options.map((o) => o.letter)).toEqual(['A', 'B', 'C']);
  });
});

describe('comparisonRows', () => {
  const group = optionGroups([A, B])[0];

  it('prices per option with deltas against Option A; zero-only rows drop', () => {
    const rows = comparisonRows(group);
    expect(rows.map((r) => r.label)).toEqual(['Hardware & Software', 'Estimated Shipping', 'Total']);
    const total = rows.find((r) => r.label === 'Total');
    expect(total.values).toEqual([1070, 1284]);
    expect(total.deltas).toEqual([null, 214]);
    expect(rows[0].kind).toBe('money');
  });

  it('adds cost / profit / margin rows only when asked', () => {
    const rows = comparisonRows(group, { includeMargin: true });
    expect(rows.map((r) => r.label)).toEqual([
      'Hardware & Software', 'Estimated Shipping', 'Total', 'Our Cost', 'Gross Profit', 'Margin',
    ]);
    const gp = rows.find((r) => r.label === 'Gross Profit');
    expect(gp.values).toEqual([270, 384]);
    expect(gp.deltas).toEqual([null, 114]);
    expect(gp.higherIsBetter).toBe(true);
    const margin = rows.find((r) => r.label === 'Margin');
    expect(margin.kind).toBe('percent');
    expect(margin.values[0]).toBeCloseTo((270 / 1070) * 100, 5);
  });

  it('no primary present → every delta is null', () => {
    const rows = comparisonRows(optionGroups([B, C])[0]);
    expect(rows.find((r) => r.label === 'Total').deltas).toEqual([null, null]);
  });
});

describe('customerComparisonRows', () => {
  it('rolls shipping into hardware and never exposes cost', () => {
    const group = optionGroups([A, B])[0];
    const rows = customerComparisonRows(group);
    expect(rows.map((r) => r.label)).toEqual(['Hardware & Equipment', 'Total Investment']);
    expect(rows[0].values).toEqual([1070, 1284]);
    expect(rows[1].deltas).toEqual([null, 214]);
    expect(JSON.stringify(rows)).not.toMatch(/cost|margin/i);
  });
});

describe('signed', () => {
  const money = (n) => `$${n.toFixed(2)}`;
  it('prefixes + / - with a plain hyphen and leaves zero unsigned', () => {
    expect(signed(214, money)).toBe('+$214.00');
    expect(signed(-50, money)).toBe('-$50.00');
    expect(signed(0, money)).toBe('$0.00');
    expect(signed(undefined, money)).toBe('$0.00');
  });
});
