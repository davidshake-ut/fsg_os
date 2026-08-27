import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OptionsComparison from '../components/OptionsComparison';
import CloneOptionModal from '../components/CloneOptionModal';
import { buildOptionComparison } from '../lib/optionComparison';
import { MUZE } from './fixtures/muze';

const noop = () => {};
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

function muzeOptions() {
  return MUZE.comparison.columns.map((col, i) => ({
    id: `o${i}`,
    label: col.label,
    quote: {
      option_label: col.label,
      option_notes: i === 0 ? 'Lowest-risk response aligned with the requested architecture.' : '',
      status: 'draft',
      version: 1,
      summary: {
        units: 400,
        aps: i === 0 ? 400 : 438,
        hardware: { cost: col.hardwareCost, price: col.hardwarePrice },
        labor: { cost: col.laborCost, price: col.laborPrice },
        cabling: { cost: col.cablingCost, price: col.cablingPrice },
        total: { cost: col.totalCost, price: col.totalPrice },
        wifiGeneration: i < 2 ? 'wifi6' : 'wifi7',
        fiberToUnits: true,
        architecture: i === 4 ? 'xgs_pon' : 'active_ethernet',
      },
    },
  }));
}

describe('OptionsComparison (SSR smoke)', () => {
  it('renders every option column, internal rows with deltas, and the notes row', () => {
    const comparison = buildOptionComparison(muzeOptions(), { termMonths: 60 });
    const html = render(OptionsComparison, { comparison, canViewMargin: true, canWrite: true, termMonths: 60, onTermChange: noop, recommendation: '', onRecommendationChange: noop, onUpdateOption: noop });
    expect(html).toContain('Options Comparison');
    expect(html).toContain('OPT 1: WIFI 6 BASELINE');
    expect(html).toContain('OPT 5: EXT HYBRID FTTU');
    expect(html).toContain('$1,201,900.03');
    expect(html).toContain('+$46,773.57'); // OPT 2 vs OPT 1 total
    expect(html).toContain('Gross profit');
    expect(html).toContain('XGS-PON (FTTU)');
    expect(html).toContain('Lowest-risk response');
    expect(html).toContain('Recommendation');
  });

  it('customer-only viewers never see cost or margin', () => {
    const comparison = buildOptionComparison(muzeOptions());
    const html = render(OptionsComparison, { comparison, canViewMargin: false });
    expect(html).not.toContain('Gross profit');
    expect(html).not.toMatch(/— cost/);
    expect(html).toContain('Total investment');
    expect(html).toContain('Per unit per month');
  });

  it('the clone modal renders its prompt', () => {
    const html = render(CloneOptionModal, { open: true, sourceLabel: 'Option A', suggested: 'Option B', onConfirm: noop, onCancel: noop });
    expect(html).toContain('Clone as a design option');
    expect(html).toContain('value="Option B"');
    expect(render(CloneOptionModal, { open: false, onConfirm: noop, onCancel: noop })).toBe('');
  });
});
