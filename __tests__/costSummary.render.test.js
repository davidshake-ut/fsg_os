import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CostSummary from '../components/CostSummary';
import { laborLinesFor, attachLabor } from '../lib/laborSplit';
import { calculateLabor } from '../lib/calculateLabor';
import { DEFAULT_LABOR_ROLES } from '../lib/defaults';

// SSR smoke for the cost summary with labor folded into each system's
// section: per-system labor row, a labor recap by system with a subtotal,
// and a total that counts each system once.

const render = (props) => renderToStaticMarkup(createElement(CostSummary, props));
const bom = (o = {}) => ({
  items: [{ sku: 'x', qty: 1 }],
  serviceItems: [],
  totalHardwareCost: 1000,
  totalHardwarePrice: 1500,
  totalServicesCost: 0,
  totalServicesPrice: 0,
  shippingCost: 70,
  shippingPrice: 105,
  grandTotalCost: 1070,
  grandTotalPrice: 1605,
  ...o,
});
const roles = DEFAULT_LABOR_ROLES;
const wifi = attachLabor({ title: 'Managed Wi-Fi', label: 'Wi-Fi', techId: 'managed_wifi', bom: bom() }, laborLinesFor(roles, { 'install-tech': 10, 'project-manager': 2 }));
const cams = attachLabor({ title: 'Video Surveillance', label: 'Camera', techId: 'video_surveillance', bom: bom() }, laborLinesFor(roles, { 'install-tech': 4 }));
const di = attachLabor(
  { title: 'Digital Infrastructure', label: 'Digital Infrastructure', techId: 'digital_infrastructure', bom: bom({ items: [], serviceItems: [{ category: 'Cabling', description: 'Runs', qty: 10, totalCost: 100, totalPrice: 200 }], totalHardwareCost: 0, totalHardwarePrice: 0, totalServicesCost: 100, totalServicesPrice: 200, shippingCost: 0, shippingPrice: 0, grandTotalCost: 100, grandTotalPrice: 200 }) },
  laborLinesFor(roles, { 'install-tech': 6 })
);
const tech = roles.find((r) => r.key === 'install-tech');
const pm = roles.find((r) => r.key === 'project-manager');

describe('CostSummary with labor per system (SSR smoke)', () => {
  it('shows labor inside each system, splits services from labor, and recaps labor by system', () => {
    const html = render({ sections: [wifi, cams, di], canViewMargin: true });
    expect((html.match(/Professional Labor/g) ?? []).length).toBeGreaterThanOrEqual(4); // 3 rows + the recap header
    expect(html).toContain('Managed Wi-Fi labor');
    expect(html).toContain('Video Surveillance labor');
    expect(html).toContain('Digital Infrastructure labor');
    expect(html).toContain('Services &amp; Cabling');
    expect(html).toContain('Professional Labor Subtotal');
    expect(html).toContain('22 hrs'); // the recap subtotal: 10 + 2 + 4 + 6
    expect(html).toContain('12 hrs'); // the Wi-Fi row: 10 + 2
    expect(html).toContain('by system — already in the subtotals above');
    // The total counts each system once (labor included via the subtotals, not again).
    const laborPrice = (10 + 4 + 6) * tech.billRate + 2 * pm.billRate;
    const total = 1605 + 1605 + 200 + laborPrice;
    const fmt = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(html).toContain(fmt);
    const subtotalFmt = `$${laborPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(html).toContain(subtotalFmt);
  });

  it('hides cost columns for non-margin viewers and keeps the recap', () => {
    const html = render({ sections: [wifi, cams], canViewMargin: false });
    expect(html).not.toContain('Our Cost');
    expect(html).toContain('Managed Wi-Fi labor');
    expect(html).not.toContain('Gross Profit');
  });

  it('a labor-only quote still renders the standalone Professional Labor section without a recap', () => {
    const labor = calculateLabor(roles, { 'install-tech': 8 });
    const html = render({ sections: [{ title: 'Professional Labor', label: 'Labor', isLabor: true, bom: labor }], canViewMargin: true });
    expect(html).toContain('Professional Labor');
    expect(html).not.toContain('labor<'); // no "<System> labor" recap rows
    expect(html).not.toContain('by system — already in the subtotals above'); // no recap group
    expect(html).toContain('Professional Labor Subtotal'); // the section's own subtotal row
    expect(html).toContain('8 hrs');
  });
});
