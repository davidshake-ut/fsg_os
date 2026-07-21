import { describe, it, expect } from 'vitest';
import { matchesTerm, licenseCandidates, guessLicenses } from '../lib/licenseMatch';

const CATALOG = [
  { sku: 'XV2-21X', desc: 'Indoor AP', category: 'Access Point', technology: 'managed_wifi' },
  { sku: 'MSX-SUB-XV2-21X-5', desc: 'XV2-21X 5yr support', category: 'Subscription', technology: 'managed_wifi' },
  { sku: 'R350', desc: 'Ruckus R350 AP', category: 'Access Point', technology: 'managed_wifi' },
  { sku: 'CLD-R350-001', desc: 'RUCKUS One for R350, 1 Year', category: 'License', technology: 'managed_wifi' },
  { sku: 'CLD-R350-005', desc: 'RUCKUS One for R350, 5 Year', category: 'License', technology: 'managed_wifi' },
  { sku: 'CLD-RKWF-1001', desc: 'Unrelated cloud license', category: 'License', technology: 'managed_wifi' },
  { sku: 'CAM-LIC-3', desc: 'Camera license 3yr', category: 'License', technology: 'video_surveillance' },
];

describe('matchesTerm', () => {
  it('recognizes "-5" SKU suffixes and "N Year" descriptions', () => {
    expect(matchesTerm({ sku: 'MSX-SUB-XV2-21X-5', desc: '' }, 5)).toBe(true);
    expect(matchesTerm({ sku: 'CLD-R350-001', desc: '1 Year' }, 1)).toBe(true);
    expect(matchesTerm({ sku: 'X', desc: 'Support, 3yr' }, 3)).toBe(true);
  });

  it('does not read "-1001" style SKUs as a 1-year term', () => {
    expect(matchesTerm({ sku: 'CLD-RKWF-1001', desc: 'Unrelated cloud license' }, 1)).toBe(false);
  });
});

describe('licenseCandidates', () => {
  it('lists same-technology licenses with SKU mentions ranked first', () => {
    const c = licenseCandidates({ sku: 'R350', technology: 'managed_wifi' }, CATALOG);
    expect(c.map((p) => p.sku).slice(0, 2)).toEqual(['CLD-R350-001', 'CLD-R350-005']);
    expect(c.some((p) => p.sku === 'CAM-LIC-3')).toBe(false); // other tech excluded
    expect(c.some((p) => p.sku === 'XV2-21X')).toBe(false); // hardware excluded
  });
});

describe('guessLicenses', () => {
  it('fills each term from licenses mentioning the product SKU', () => {
    expect(guessLicenses({ sku: 'R350', technology: 'managed_wifi' }, CATALOG)).toEqual({
      license_sku_1yr: 'CLD-R350-001',
      license_sku_3yr: null,
      license_sku_5yr: 'CLD-R350-005',
    });
  });

  it('matches the Cambium -5 suffix pattern', () => {
    const g = guessLicenses({ sku: 'XV2-21X', technology: 'managed_wifi' }, CATALOG);
    expect(g.license_sku_5yr).toBe('MSX-SUB-XV2-21X-5');
  });

  it('guesses nothing when no license mentions the SKU', () => {
    expect(guessLicenses({ sku: 'ICX7150-24P', technology: 'managed_wifi' }, CATALOG)).toEqual({
      license_sku_1yr: null,
      license_sku_3yr: null,
      license_sku_5yr: null,
    });
  });
});
