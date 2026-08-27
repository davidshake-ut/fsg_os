import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RecurringSection from '../components/builder/RecurringSection';
import { DEFAULT_CARRIER_CIRCUITS, circuitItem, supportFeeItem } from '../lib/recurring';
import { normalizeFinancing } from '../lib/financing';

const noop = () => {};
const render = (props) => renderToStaticMarkup(createElement(RecurringSection, props));
const summary = { units: 400, hardware: { price: 529643.83 }, labor: { price: 235250 }, total: { price: 1201900.03 } };

describe('RecurringSection (SSR smoke)', () => {
  it('collapsed and empty without items or financing', () => {
    const html = render({ recurring: null, financingPolicy: normalizeFinancing(null), summary, canViewMargin: true, canWrite: true, onChange: noop, onFinancingChange: noop });
    expect(html).toContain('Recurring &amp; Financing');
    expect(html).toContain('— none');
    expect(html).not.toContain('Monthly recurring');
  });

  it('lists items with monthly figures, the totals, and the payment table when financing is on', () => {
    const segra = DEFAULT_CARRIER_CIRCUITS.find((c) => c.id === 'segra-5g-60');
    const recurring = { items: [circuitItem(segra, { id: 'a' }), supportFeeItem({ id: 'b', cost: 900, pricePerUnit: 4.75 })] };
    const policy = normalizeFinancing({ enabled: true, apr: 12, terms: [36, 60], lenderDiscountPct: 12 });
    const html = render({
      recurring,
      onChange: noop,
      financingOverride: { enabled: true },
      onFinancingChange: noop,
      financingPolicy: policy,
      carrierCircuits: DEFAULT_CARRIER_CIRCUITS,
      summary,
      canViewMargin: true,
      canWrite: true,
    });
    expect(html).toContain('5 Gb fiber circuit — Segra');
    expect(html).toContain('$1,900.00'); // 400 × 4.75
    expect(html).toContain('$3,595.00'); // 1,695 + 1,900
    expect(html).toContain('36 months');
    expect(html).toContain('60 months');
    expect(html).toContain('Team defaults');
    expect(html).toContain('uplift');
    expect(html).toContain('Carrier circuit');
    expect(html).toContain('Finance charge');
  });

  it('read-only for viewers: no inputs, no cost column, no add menu', () => {
    const recurring = { items: [supportFeeItem({ id: 'b', cost: 900, pricePerUnit: 4.75 })] };
    const html = render({ recurring, financingPolicy: normalizeFinancing({ enabled: true }), summary, canViewMargin: false, canWrite: false });
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Our cost');
    expect(html).not.toContain('Finance charge');
    expect(html).toContain('Offered');
    expect(html).toContain('$1,900.00');
  });
});
