import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WifiTakeoffPanel from '../components/builder/WifiTakeoffPanel';
import IdfPlanCard from '../components/builder/IdfPlanCard';
import { calculateBOM } from '../lib/calculateBOM';
import { buildWifiTakeoff } from '../lib/wifiTakeoff';
import { DEFAULT_INPUTS } from '../lib/defaults';
import { BASE_PRODUCTS } from '../lib/catalog';
import { parseDelimited } from '../lib/csv';
import { guessUnitScheduleMapping, parseUnitSchedule, propertyFromImport, normalizePropertyModel } from '../lib/propertyModel';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';

// SSR smoke test for the Phase 2 Wi-Fi surfaces: the Design Source rail
// section in both modes and the IDF Plan card over a real takeoff.

const noop = () => {};
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const TAGGED = [
  { sku: 'R650', desc: 'AP', category: 'Access Point', technology: 'managed_wifi', cost: 400, price: 1300, mount_type: 'ceiling', quality_tier: 'better', poe_watts: 22 },
  { sku: 'ICX-8', desc: '8-port', category: 'Switch', technology: 'managed_wifi', cost: 400, price: 700, quality_tier: 'better', port_count: 8, poe_budget_watts: 124 },
  { sku: 'ICX-24', desc: '24-port', category: 'Switch', technology: 'managed_wifi', cost: 700, price: 1200, quality_tier: 'better', port_count: 24, poe_budget_watts: 370 },
  { sku: 'ICX-48', desc: '48-port', category: 'Switch', technology: 'managed_wifi', cost: 1400, price: 2400, quality_tier: 'better', port_count: 48, poe_budget_watts: 740 },
];

function muzeProperty() {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  return normalizePropertyModel(propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows))));
}

describe('Wi-Fi takeoff UI (SSR smoke)', () => {
  it('the Design Source section explains itself without a property model', () => {
    const html = render(WifiTakeoffPanel, { inputs: { ...DEFAULT_INPUTS }, setInputs: noop, products: [] });
    expect(html).toContain('Design Source');
    expect(html).toContain('Enable Digital Infrastructure');
  });

  it('in property mode it lists the coverage rules per unit class and the takeoff summary', () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      techCalc: { digital_infrastructure: muzeProperty() },
      wifiTakeoff: { enabled: true, apsPerClass: { 3: 2, th: 2 } },
    };
    const html = render(WifiTakeoffPanel, { inputs, setInputs: noop, products: [...BASE_PRODUCTS, ...TAGGED] });
    expect(html).toContain('1 BR · 240 units');
    expect(html).toContain('Townhome · 16 units');
    expect(html).toContain('One small PoE switch per townhome');
    expect(html).toContain('>438<'); // unit APs
    expect(html).toContain('>38<'); // units with 2+ APs
    expect(html).toContain('ICX-24'); // in-unit switch product picker lists switches
  });

  it('the IDF Plan card renders every room, the townhome rule row, and totals', () => {
    const property = muzeProperty();
    const takeoff = buildWifiTakeoff(property, { enabled: true, apsPerClass: { 3: 2, th: 2 }, roomOverrides: { [property.rooms[1].id]: { s8: 1, s24: 1, s48: 1 } } });
    const inputs = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better' };
    const bom = calculateBOM(inputs, {}, {}, [...BASE_PRODUCTS, ...TAGGED], [], null, takeoff);
    const html = render(IdfPlanCard, { bom, takeoff, onOverride: noop });
    expect(html).toContain('IDF Plan');
    expect(html).toContain('B1 Basement');
    expect(html).toContain('>MDF<');
    expect(html).toContain('Townhomes — one switch per unit');
    expect(html).toContain('reset'); // the overridden room offers a reset
    expect(html).toContain('in-unit switch');
    expect(html).toContain('19 telecom rooms');
  });

  it('renders nothing on the classic path', () => {
    const bom = calculateBOM({ ...DEFAULT_INPUTS, includeWifi: true }, {}, {}, BASE_PRODUCTS);
    expect(render(IdfPlanCard, { bom, takeoff: null, onOverride: noop })).toBe('');
  });
});
