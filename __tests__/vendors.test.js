import { describe, it, expect } from 'vitest';
import {
  companyTechVendors,
  resolveQuoteVendors,
  lineVendorId,
  linesForVendor,
  newVendorId,
  primaryVendorCandidates,
  productRidesWithVendor,
} from '../lib/vendors';

const CAMBIUM = { id: 'vnd_cambium1', name: 'Cambium Networks' };
const RUCKUS = { id: 'vnd_ruckus01', name: 'Ruckus' };
const company = (vendors) => ({ settings: { technologyVendors: { managed_wifi: vendors } } });

describe('companyTechVendors', () => {
  it('returns [] with no settings, and drops malformed entries', () => {
    expect(companyTechVendors(null, 'managed_wifi')).toEqual([]);
    expect(companyTechVendors({}, 'managed_wifi')).toEqual([]);
    expect(
      companyTechVendors(company([CAMBIUM, { id: 'x' }, { name: 'NoId' }, null]), 'managed_wifi')
    ).toEqual([CAMBIUM]);
  });
});

describe('resolveQuoteVendors', () => {
  it('vendorless when the registry is empty — even if the quote has snapshots', () => {
    expect(resolveQuoteVendors({ techVendors: { managed_wifi: [CAMBIUM] } }, {}, 'managed_wifi')).toEqual([]);
  });

  it('legacy quote (no techVendors) defaults to registry[0], primary + engine', () => {
    const out = resolveQuoteVendors({}, company([CAMBIUM, RUCKUS]), 'managed_wifi', true);
    expect(out).toEqual([
      { id: CAMBIUM.id, name: CAMBIUM.name, isPrimary: true, isEngine: true },
    ]);
  });

  it('enabled vendors keep registry order and live registry names win over snapshots', () => {
    const inputs = {
      techVendors: { managed_wifi: [{ id: RUCKUS.id, name: 'Ruckus (old name)' }, CAMBIUM] },
    };
    const out = resolveQuoteVendors(inputs, company([CAMBIUM, RUCKUS]), 'managed_wifi');
    expect(out.map((v) => v.name)).toEqual(['Cambium Networks', 'Ruckus']);
  });

  it('a deleted vendor keeps rendering under its snapshot name, after live ones', () => {
    const inputs = { techVendors: { managed_wifi: [CAMBIUM, { id: 'vnd_gone0001', name: 'Aruba' }] } };
    const out = resolveQuoteVendors(inputs, company([CAMBIUM]), 'managed_wifi');
    expect(out.map((v) => v.name)).toEqual(['Cambium Networks', 'Aruba']);
  });

  it('primary follows techVendorPrimary when enabled, else first enabled', () => {
    const inputs = {
      techVendors: { managed_wifi: [CAMBIUM, RUCKUS] },
      techVendorPrimary: { managed_wifi: RUCKUS.id },
    };
    const out = resolveQuoteVendors(inputs, company([CAMBIUM, RUCKUS]), 'managed_wifi');
    expect(out.find((v) => v.isPrimary).id).toBe(RUCKUS.id);

    const stale = resolveQuoteVendors(
      { ...inputs, techVendorPrimary: { managed_wifi: 'vnd_gone0001' } },
      company([CAMBIUM, RUCKUS]),
      'managed_wifi'
    );
    expect(stale.find((v) => v.isPrimary).id).toBe(CAMBIUM.id);
  });

  it('engine is registry[0] only when the tech has a legacy engine', () => {
    const inputs = { techVendors: { managed_wifi: [CAMBIUM, RUCKUS] } };
    const withEngine = resolveQuoteVendors(inputs, company([CAMBIUM, RUCKUS]), 'managed_wifi', true);
    expect(withEngine.find((v) => v.isEngine)?.id).toBe(CAMBIUM.id);
    const without = resolveQuoteVendors(inputs, company([CAMBIUM, RUCKUS]), 'managed_wifi', false);
    expect(without.every((v) => !v.isEngine)).toBe(true);
  });
});

describe('line coalescing', () => {
  const enabled = [CAMBIUM.id, RUCKUS.id];
  const mkLine = (vendor, price = 100) => ({
    id: `${vendor ?? 'legacy'}-${price}`,
    system: 'managed_wifi',
    vendor,
    qty: 1,
    cost: 50,
    price,
  });

  it('legacy / disabled / deleted vendors coalesce to primary', () => {
    expect(lineVendorId(mkLine(undefined), enabled, CAMBIUM.id)).toBe(CAMBIUM.id);
    expect(lineVendorId(mkLine('vnd_gone0001'), enabled, CAMBIUM.id)).toBe(CAMBIUM.id);
    expect(lineVendorId(mkLine(RUCKUS.id), enabled, CAMBIUM.id)).toBe(RUCKUS.id);
  });

  it('bucket partition never drops a line, across any enablement permutation', () => {
    const lines = [
      mkLine(undefined, 10),
      mkLine(CAMBIUM.id, 20),
      mkLine(RUCKUS.id, 30),
      mkLine('vnd_gone0001', 40),
      { id: 'other-tech', system: 'ev_charging', vendor: RUCKUS.id, qty: 1, cost: 1, price: 1 },
    ];
    for (const ids of [[CAMBIUM.id, RUCKUS.id], [CAMBIUM.id], [RUCKUS.id]]) {
      const primary = ids[0];
      const bucketed = ids.flatMap((v) => linesForVendor(lines, 'managed_wifi', v, ids, primary));
      expect(bucketed).toHaveLength(4); // every managed_wifi line lands exactly once
      expect(new Set(bucketed.map((l) => l.id)).size).toBe(4);
    }
  });
});

describe('primary vs secondary vendors', () => {
  const CATALOG = [
    { sku: 'AP-1', category: 'Access Point', technology: 'managed_wifi', vendor: 'Cambium Networks' },
    { sku: 'AP-2', category: 'Access Point', technology: 'managed_wifi', vendor: 'Ruckus' },
    { sku: 'UPS-1', category: 'UPS', technology: 'managed_wifi', vendor: 'Vertiv' },
    { sku: 'RACK-1', category: 'Rack', technology: 'managed_wifi', vendor: 'Middle Atlantic' },
    { sku: 'CBL-1', category: 'Cable', technology: 'managed_wifi', vendor: '' },
    { sku: 'CAM-1', category: 'Camera', technology: 'video_surveillance', vendor: 'Uniview' },
  ];

  it('primaryVendorCandidates lists only core-equipment makers for the tech', () => {
    expect(primaryVendorCandidates(CATALOG, 'managed_wifi')).toEqual(['Cambium Networks', 'Ruckus']);
    expect(primaryVendorCandidates(CATALOG, 'video_surveillance')).toEqual(['Uniview']);
  });

  it('secondary and unbranded gear rides with every primary; rival primaries never leak', () => {
    const primaries = ['Cambium Networks', 'Ruckus'];
    const ruckusPicker = CATALOG.filter(
      (p) => p.technology === 'managed_wifi' && productRidesWithVendor(p, 'Ruckus', primaries)
    ).map((p) => p.sku);
    expect(ruckusPicker).toEqual(['AP-2', 'UPS-1', 'RACK-1', 'CBL-1']); // no Cambium AP
  });
});

describe('newVendorId', () => {
  it('produces unique vnd_-prefixed ids', () => {
    const a = newVendorId();
    const b = newVendorId();
    expect(a).toMatch(/^vnd_[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});
