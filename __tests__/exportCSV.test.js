import { describe, it, expect, beforeEach } from 'vitest';
import { exportCSV } from '../lib/exportCSV';

// Capture the generated CSV text via mocked browser download globals.
let csvText = '';
beforeEach(() => {
  csvText = '';
  globalThis.Blob = class {
    constructor(parts) {
      csvText = parts.join('');
    }
  };
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  globalThis.document = {
    createElement: () => ({ click() {}, set href(_v) {}, set download(_v) {} }),
  };
});

const fakeBom = (overrides = {}) => ({
  items: [{ category: 'Access Point', sku: 'AP1', description: 'AP', qty: 2, unitPrice: 100, totalPrice: 200 }],
  serviceItems: [],
  totalHardwarePrice: 200,
  totalServicesPrice: 0,
  shippingPrice: 14,
  grandTotalPrice: 214,
  ...overrides,
});

describe('exportCSV — multi-section quote', () => {
  it('renders each section + a combined project grand total', () => {
    const sections = [
      { title: 'Managed Wi-Fi', bom: fakeBom() },
      {
        title: 'Camera Systems',
        bom: fakeBom({
          items: [{ category: 'Camera', sku: 'C1', description: 'Cam', qty: 4, unitPrice: 250, totalPrice: 1000 }],
          serviceItems: [{ sku: 'CAM-INSTALL', description: 'Install', unitPrice: 300, totalPrice: 300 }],
          totalHardwarePrice: 1000,
          totalServicesPrice: 300,
          shippingPrice: 70,
          grandTotalPrice: 1370,
        }),
      },
    ];
    exportCSV({ propertyName: 'Test Hotel' }, sections, { fileSuffix: 'Quote' });

    expect(csvText).toContain('=== MANAGED WI-FI ===');
    expect(csvText).toContain('=== CAMERA SYSTEMS ===');
    expect(csvText).toContain('Camera Systems — Professional Services');
    expect(csvText).toContain('PROJECT GRAND TOTAL');
    expect(csvText).toContain('1584.00'); // 214 + 1370 combined
  });

  it('tags Option-B alternates, keeps them out of the grand total, and appends a comparison', () => {
    const A = {
      title: 'Managed Wi-Fi — Cambium Networks', label: 'Wi-Fi', techLabel: 'Managed Wi-Fi',
      optionGroup: 'managed_wifi', isPrimary: true, vendorId: 'vnd_a', vendorName: 'Cambium Networks',
      bom: fakeBom(),
    };
    const B = {
      title: 'Managed Wi-Fi — Ruckus', label: 'Managed Wi-Fi', techLabel: 'Managed Wi-Fi',
      optionGroup: 'managed_wifi', isPrimary: false, vendorId: 'vnd_b', vendorName: 'Ruckus',
      bom: fakeBom({
        items: [{ category: 'Access Point', sku: 'R1', description: 'Ruckus AP', qty: 2, unitPrice: 150, totalPrice: 300 }],
        totalHardwarePrice: 300,
        shippingPrice: 21,
        grandTotalPrice: 321,
      }),
    };
    exportCSV({ propertyName: 'X' }, [A, B]);

    expect(csvText).toContain('=== OPTION A — MANAGED WI-FI — CAMBIUM NETWORKS ===');
    expect(csvText).toContain('=== OPTION B (ALTERNATE) — MANAGED WI-FI — RUCKUS ===');
    expect(csvText).toContain('Managed Wi-Fi — Ruckus Subtotal (Alternate — not in grand total)');
    expect(csvText).toContain('"","","PROJECT GRAND TOTAL","","","214.00"'); // Option A only
    expect(csvText).toContain('=== OPTION COMPARISON — MANAGED WI-FI ===');
    expect(csvText).toContain('"Category","Option A — Cambium Networks (Quoted)","Option B — Ruckus","Difference (B vs A)"');
    expect(csvText).toContain('"Total","214.00","321.00","+107.00"');
    expect(csvText).not.toMatch(/Our Cost|Margin/); // the CSV never carries cost
  });

  it('a single enabled vendor stays the legacy plain shape', () => {
    exportCSV({ propertyName: 'X' }, [{ title: 'Managed Wi-Fi', bom: fakeBom() }]);
    expect(csvText).toContain('=== MANAGED WI-FI ===');
    expect(csvText).not.toContain('OPTION');
  });

  it('omits sections with no items', () => {
    const sections = [
      { title: 'Managed Wi-Fi', bom: fakeBom() },
      { title: 'Camera Systems', bom: fakeBom({ items: [], grandTotalPrice: 0 }) },
    ];
    exportCSV({ propertyName: 'X' }, sections);
    expect(csvText).toContain('=== MANAGED WI-FI ===');
    expect(csvText).not.toContain('=== CAMERA SYSTEMS ===');
  });
});
