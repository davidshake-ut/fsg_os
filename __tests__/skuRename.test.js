import { describe, it, expect } from 'vitest';
import { deepRenameSku, proposalSkuRefs, applySkuRename } from '../lib/skuRename';

const OLD = 'WRONG-100';
const NEW = 'RIGHT-200';

describe('deepRenameSku', () => {
  it('renames object keys equal to the sku (keyed maps)', () => {
    const out = deepRenameSku({ [OLD]: { cost: 5 }, OTHER: { cost: 1 } }, OLD, NEW);
    expect(out[NEW]).toEqual({ cost: 5 });
    expect(out[OLD]).toBeUndefined();
    expect(out.OTHER).toEqual({ cost: 1 });
  });

  it('renames sku-ish string values but not other strings', () => {
    const out = deepRenameSku(
      { sku: OLD, baseSku: OLD, license_sku_5yr: OLD, description: `replaces ${OLD}`, note: OLD },
      OLD, NEW
    );
    expect(out.sku).toBe(NEW);
    expect(out.baseSku).toBe(NEW);
    expect(out.license_sku_5yr).toBe(NEW);
    expect(out.description).toBe(`replaces ${OLD}`); // prose untouched
    expect(out.note).toBe(OLD); // non-sku property untouched even when exact match
  });

  it('walks arrays and nested structures', () => {
    const out = deepRenameSku([{ lines: [{ sku: OLD, qty: 2 }] }, { sku: 'OTHER' }], OLD, NEW);
    expect(out[0].lines[0]).toEqual({ sku: NEW, qty: 2 });
    expect(out[1].sku).toBe('OTHER');
  });

  it('leaves primitives and null alone', () => {
    expect(deepRenameSku(null, OLD, NEW)).toBe(null);
    expect(deepRenameSku(7, OLD, NEW)).toBe(7);
    expect(deepRenameSku(OLD, OLD, NEW)).toBe(OLD); // bare string has no sku-ish key context
  });
});

describe('proposalSkuRefs', () => {
  it('reports every location that references the sku', () => {
    const project = {
      price_overrides: { [OLD]: { cost: 1, price: 2 } },
      custom_line_items: [{ sku: OLD, qty: 1 }],
      catalog_snapshot: { [OLD]: { sku: OLD, cost: 1 } },
      inputs: { techCalc: { access_control: { lines: [{ sku: OLD }] } } },
      bom_snapshot: [{ sku: OLD, qty: 3 }],
    };
    expect(proposalSkuRefs(project, OLD)).toEqual([
      'price override', 'custom line item', 'locked price snapshot', 'design selections', 'saved BOM snapshot',
    ]);
  });

  it('returns empty for a proposal that never references it', () => {
    const project = {
      price_overrides: { OTHER: { cost: 1 } },
      custom_line_items: [{ sku: 'OTHER' }],
      inputs: { techCalc: {} },
    };
    expect(proposalSkuRefs(project, OLD)).toEqual([]);
  });
});

describe('applySkuRename', () => {
  it('patches only the columns that reference the sku', () => {
    const project = {
      price_overrides: { [OLD]: { cost: 1, price: 2 } },
      custom_line_items: [{ sku: 'OTHER', qty: 1 }],
      catalog_snapshot: null,
      inputs: { propertyName: 'Marquetti', techCalc: { av: { lines: [{ sku: OLD, qty: 4 }] } } },
    };
    const patch = applySkuRename(project, OLD, NEW);
    expect(Object.keys(patch).sort()).toEqual(['inputs', 'price_overrides']);
    expect(patch.price_overrides[NEW]).toEqual({ cost: 1, price: 2 });
    expect(patch.inputs.techCalc.av.lines[0].sku).toBe(NEW);
    expect(patch.inputs.propertyName).toBe('Marquetti'); // untouched fields ride along intact
  });

  it('preserves all other values in renamed structures', () => {
    const project = {
      catalog_snapshot: { [OLD]: { sku: OLD, desc: 'Widget', cost: 10, price: 20 }, KEEP: { sku: 'KEEP', cost: 1 } },
    };
    const patch = applySkuRename(project, OLD, NEW);
    expect(patch.catalog_snapshot[NEW]).toEqual({ sku: NEW, desc: 'Widget', cost: 10, price: 20 });
    expect(patch.catalog_snapshot.KEEP).toEqual({ sku: 'KEEP', cost: 1 });
  });

  it('returns null when nothing references the sku', () => {
    expect(applySkuRename({ price_overrides: { OTHER: {} }, custom_line_items: [] }, OLD, NEW)).toBe(null);
  });
});
