import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { digitalInfrastructureCalculator as calc } from '../components/builder/calculators/digitalInfrastructure';
import { parseDelimited } from '../lib/csv';
import { guessUnitScheduleMapping, parseUnitSchedule, propertyFromImport } from '../lib/propertyModel';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';

// Server-render smoke test: the Digital Infrastructure rail and surface
// must render the empty state and a full imported property without
// throwing. It is not a pixel test — it catches the runtime errors a
// production build cannot (bad property access, hook misuse).

const noop = () => {};
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

describe('Digital Infrastructure calculator (SSR smoke)', () => {
  it('registers on the calculator contract with a rail and a surface and no priced lines yet', () => {
    expect(calc.techId).toBe('digital_infrastructure');
    expect(typeof calc.InputPanel).toBe('function');
    expect(typeof calc.Surface).toBe('function');
    expect(calc.compute).toBeUndefined();
    expect(calc.Body).toBeUndefined();
  });

  it('empty property: the rail shows zero totals and the surface invites an import', () => {
    const rail = render(calc.InputPanel, { value: calc.defaults, onChange: noop });
    expect(rail).toContain('Property');
    expect(rail).toContain('Amenity AP locations');
    expect(rail).toContain('Other network drops');
    const surface = render(calc.Surface, { value: calc.defaults, onChange: noop });
    expect(surface).toContain('Start with the property');
    expect(surface).toContain('Import unit schedule');
    expect(surface).toContain('Unit Schedule');
  });

  it('imported Muze model: layout card with rooms, the 49-row grid, and 400 / 598 in the rail', () => {
    const rows = parseDelimited(muzeUnitSchedulePaste());
    const imported = propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows)));
    const value = {
      ...calc.defaults,
      ...imported,
      amenityLocations: [{ id: 'a1', name: 'Lounge', qty: 1 }],
      otherDrops: [{ id: 'd1', name: 'Elevators', qty: 5, included: false }],
    };

    const rail = render(calc.InputPanel, { value, onChange: noop });
    expect(rail).toContain('>400<');
    expect(rail).toContain('>598<');
    expect(rail).toContain('Townhome');
    expect(rail).toContain('MDF: B1 Basement');
    expect(rail).toContain('Elevators');

    const surface = render(calc.Surface, { value, onChange: noop });
    expect(surface).toContain('Buildings, Levels');
    expect(surface).toContain('Building 4');
    expect(surface).toContain('B1 Basement');
    expect(surface).toContain('Townhomes');
    expect((surface.match(/value="TH1"/g) ?? []).length).toBe(1);
    expect((surface.match(/value="A5 ANSI A"/g) ?? []).length).toBe(1);
    expect(surface).toContain('Units per level');
  });
});
