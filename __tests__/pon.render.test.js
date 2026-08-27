import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { digitalInfrastructureCalculator as calc } from '../components/builder/calculators/digitalInfrastructure';
import PonCard from '../components/builder/PonCard';
import { mergeProducts } from '../lib/mergeProducts';
import { rollUpAssemblies } from '../lib/assemblies';
import { parseDelimited } from '../lib/csv';
import { guessUnitScheduleMapping, parseUnitSchedule, propertyFromImport } from '../lib/propertyModel';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';

// SSR smoke for the Phase 8 surfaces: the architecture switch in the rail,
// the XGS-PON card on the surface, and the FTTU kits it implies.

const noop = () => {};
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const products = rollUpAssemblies(mergeProducts([]));
const muze = () => {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  return { ...calc.defaults, ...propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows))) };
};

describe('XGS-PON (SSR smoke)', () => {
  it('the rail offers the architecture switch; Active Ethernet shows no PON card', () => {
    const value = muze();
    const rail = render(calc.InputPanel, { value, onChange: noop, products });
    expect(rail).toContain('Architecture');
    expect(rail).toContain('XGS-PON (FTTU)');
    expect(rail).toContain('Active Ethernet');
    expect(rail).toContain('KIT-IDF-12U — $2,940.32');
    const surface = render(calc.Surface, { value, onChange: noop, products, ctx: { inputs: {}, canViewMargin: true } });
    expect(surface).not.toContain('XGS-PON design');
  });

  it('under XGS-PON the surface shows the PON card with counts, SKUs, and totals, and the rail names the FTTU kits', () => {
    const value = { ...muze(), architecture: 'xgs_pon', pon: { onuCount: 4 } };
    const ctx = { inputs: { wifiTakeoff: { enabled: true, apsPerClass: { 3: 2, th: 2 } } }, canViewMargin: true };
    const surface = render(calc.Surface, { value, onChange: noop, products, ctx });
    expect(surface).toContain('XGS-PON design');
    expect(surface).toContain('>438</b> ONTs');
    expect(surface).toContain('>14</b> × 1:32 splitters');
    expect(surface).toContain('TCX16-0A00');
    expect(surface).toContain('SXX00-0A01');
    expect(surface).toContain('PON hardware');
    expect(surface).toContain('XGS-PON: the lit fiber carries the unit'); // the cabling card's Cat6-to-unit hint
    const rail = render(calc.InputPanel, { value, onChange: noop, products });
    expect(rail).toContain('FTTU kit variants follow the XGS-PON architecture');
    expect(rail).toContain('KIT-IDF-12U-FTTU — $3,889.31');
    // Read-only viewers see prices but no cost column.
    const card = render(PonCard, { model: value, onChange: noop, products, inputs: ctx.inputs, canViewMargin: false });
    expect(card).not.toContain('Unit cost');
    expect(card).toContain('Unit price');
  });
});
