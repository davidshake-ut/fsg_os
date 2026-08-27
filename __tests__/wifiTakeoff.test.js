import { describe, it, expect } from 'vitest';
import { calculateBOM } from '../lib/calculateBOM';
import { DEFAULT_INPUTS } from '../lib/defaults';
import { BASE_PRODUCTS } from '../lib/catalog';
import { estimateLaborHours } from '../lib/estimateLaborHours';
import { buildScopeOfWork } from '../lib/scopeOfWork';
import { WIFI_TAKEOFF_DEFAULTS, apsForClass, buildWifiTakeoff, unitClassesPresent, propertyModelHasUnits } from '../lib/wifiTakeoff';

// A tagged catalog (0061 attributes) so the engine sizes by PoE budget and
// ports: a 22 W AP, and 8 / 24 / 48-port switches at 124 / 370 / 740 W.
const TAGGED = [
  { sku: 'AP-22W', desc: 'Ceiling AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'Acme', cost: 300, price: 500, mount_type: 'ceiling', quality_tier: 'better', poe_watts: 22 },
  { sku: 'SW-8', desc: '8-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Acme', cost: 400, price: 700, quality_tier: 'better', port_count: 8, poe_budget_watts: 124 },
  { sku: 'SW-24', desc: '24-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Acme', cost: 700, price: 1200, quality_tier: 'better', port_count: 24, poe_budget_watts: 370 },
  { sku: 'SW-48', desc: '48-port PoE', category: 'Switch', technology: 'managed_wifi', vendor: 'Acme', cost: 1400, price: 2400, quality_tier: 'better', port_count: 48, poe_budget_watts: 740 },
  { sku: 'TL-SG105', desc: '5-port unmanaged', category: 'Switch', technology: 'managed_wifi', vendor: 'TP-Link', cost: 50, price: 100 },
];
const PRODUCTS = [...BASE_PRODUCTS, ...TAGGED];
const INPUTS = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better', deploymentType: 'ceiling', includeShipping: false };
const qtyOf = (bom, sku) => bom.items.filter((i) => i.sku === sku).reduce((s, i) => s + i.qty, 0);

// Two buildings: B1 has an MDF serving two floors (26 + 3 APs), B2 an IDF
// with 40 units; a townhome row with 4 units.
const model = () => ({
  buildings: [{ id: 'b1', name: 'Building 1' }, { id: 'b2', name: 'Building 2' }, { id: 'th', name: 'Townhomes' }],
  levels: [
    { id: 'l1', buildingId: 'b1', name: 'Level 1', roomId: 'mdf' },
    { id: 'l2', buildingId: 'b1', name: 'Level 2', roomId: 'mdf' },
    { id: 'l3', buildingId: 'b2', name: 'Level 1', roomId: 'idf' },
    { id: 'l4', buildingId: 'b2', name: 'Level 2', roomId: null },
    { id: 'lt', buildingId: 'th', name: 'Townhomes', roomId: 'thr' },
  ],
  rooms: [{ id: 'mdf', name: 'B1 MDF', isMdf: true }, { id: 'idf', name: 'B2 IDF', isMdf: false }, { id: 'thr', name: 'TH', isMdf: false }],
  unitTypes: [
    { id: 'u1', code: 'A1', bedrooms: 1, kind: 'apartment', sqft: 600, counts: { l1: 20, l2: 3 } },
    { id: 'u2', code: 'C1', bedrooms: 3, kind: 'apartment', sqft: 1300, counts: { l1: 3, l3: 40 } },
    { id: 'u3', code: 'TH1', bedrooms: 3, kind: 'townhome', sqft: 1600, counts: { lt: 4 } },
    { id: 'u4', code: 'B9', bedrooms: 2, kind: 'apartment', sqft: 900, counts: { l4: 2 } },
  ],
  amenityLocations: [{ id: 'a1', name: 'Lounge', qty: 2 }, { id: 'a2', name: 'Gym', qty: 1 }],
  outdoorLocations: [{ id: 'o1', name: 'Pool', qty: 2 }],
  otherDrops: [{ id: 'd1', name: 'Elevators', qty: 5, included: false }, { id: 'd2', name: 'Printers', qty: 2, included: true }],
  notes: '',
});
const EXTENDED = { enabled: true, apsPerClass: { 3: 2, th: 2 } };

describe('coverage rules', () => {
  it('apsForClass uses the class rule, else the default, and treats blanks as unset', () => {
    expect(apsForClass({ apsPerClass: { 3: 2 }, defaultApsPerUnit: 1 }, '3')).toBe(2);
    expect(apsForClass({ apsPerClass: { 3: '' }, defaultApsPerUnit: 1 }, '3')).toBe(1);
    expect(apsForClass({ apsPerClass: { 3: 0 }, defaultApsPerUnit: 1 }, '3')).toBe(0);
    expect(apsForClass({}, 'th')).toBe(1);
    expect(apsForClass({ defaultApsPerUnit: 2 }, '1')).toBe(2);
  });

  it('unitClassesPresent / propertyModelHasUnits read the model', () => {
    expect(unitClassesPresent(model())).toEqual(['1', '2', '3', 'th']);
    expect(propertyModelHasUnits(model())).toBe(true);
    expect(propertyModelHasUnits(undefined)).toBe(false);
  });
});

describe('buildWifiTakeoff', () => {
  it('baseline: one AP per unit, rooms aggregate their levels, townhome room flagged', () => {
    const t = buildWifiTakeoff(model(), { enabled: true });
    expect(t.units).toBe(72);
    expect(t.unitAPs).toBe(72);
    expect(t.apsByLevel).toEqual({ l1: 23, l2: 3, l3: 40, l4: 2, lt: 4 });
    expect(t.apsByClass).toEqual({ 1: 23, 3: 43, th: 4, 2: 2 });
    expect(t.multiApUnits).toBe(0);
    expect(t.townhomeUnits).toBe(4);
    expect(t.rooms.map((r) => [r.id, r.aps, r.units, r.townhome, r.isMdf])).toEqual([
      ['mdf', 26, 26, false, true],
      ['idf', 40, 40, false, false],
      ['thr', 4, 4, true, false],
    ]);
    expect(t.rooms[0].levelNames).toEqual(['Level 1', 'Level 2']);
    expect(t.idfRooms).toBe(1);
    expect(t.unassignedLevelIds).toEqual(['l4']);
    expect(t.unassignedAPs).toBe(2);
    expect(t.amenityAPs).toBe(3);
    expect(t.outdoorAPs).toBe(2);
    expect(t.otherDrops).toBe(2);
    expect(t.overheadPct).toBe(20);
  });

  it('extended rules double 3-bedroom and townhome APs and count the multi-AP units', () => {
    const t = buildWifiTakeoff(model(), EXTENDED);
    expect(t.unitAPs).toBe(72 + 43 + 4);
    expect(t.multiApUnits).toBe(43 + 4);
    expect(t.townhomeAPs).toBe(8);
    expect(t.rooms.find((r) => r.id === 'idf').aps).toBe(80);
  });

  it('lists off → amenity / outdoor are null so the typed counts apply; overrides pass through', () => {
    const t = buildWifiTakeoff(model(), { useLocationLists: false, roomOverrides: { idf: { s8: 1, s24: '2', s48: 0 } } });
    expect(t.amenityAPs).toBeNull();
    expect(t.outdoorAPs).toBeNull();
    expect(t.rooms.find((r) => r.id === 'idf').overrides).toEqual({ s8: 1, s24: 2, s48: 0 });
    expect(t.rooms.find((r) => r.id === 'mdf').overrides).toBeNull();
  });

  it('defaults are the documented ones', () => {
    expect(WIFI_TAKEOFF_DEFAULTS).toMatchObject({ enabled: false, defaultApsPerUnit: 1, portOverheadPct: 20, switchPerTownhome: true, inUnitSwitchForMultiAp: true, useLocationLists: true });
  });
});

describe('calculateBOM in takeoff mode', () => {
  const run = (settings, extraInputs = {}) =>
    calculateBOM({ ...INPUTS, ...extraInputs }, {}, {}, PRODUCTS, [], null, buildWifiTakeoff(model(), { enabled: true, ...settings }));

  it('sizes each telecom room by PoE budget and ports, gives townhomes a switch per unit, counts in-unit switches', () => {
    const bom = run(EXTENDED);
    // MDF: 23 + 3 (+3 second APs on the 3 BR) = 29 APs → 33 cap on a 48 → one 48.
    // IDF: 80 APs → 48 (33) + 48 (33) + 24 (14 ≤ 16).
    expect(bom.guestRoomAPs).toBe(119);
    expect(bom.takeoffUsed).toBe(true);
    expect(bom.idfPlan.map((p) => [p.name, p.aps, p.s8, p.s24, p.s48])).toEqual([
      ['B1 MDF', 29, 0, 0, 1],
      ['B2 IDF', 80, 0, 1, 2],
      ['Townhomes — one switch per unit', 8, 4, 0, 0],
    ]);
    expect(bom.idfPlan[1].ports).toBe(96); // 80 × 1.2
    expect(bom.idfPlan[1].poeWatts).toBe(80 * 22);
    expect(bom).toMatchObject({ idfSwitches8: 4, idfSwitches24: 1, idfSwitches48: 3, totalIdfSwitches: 8, inUnitSwitches: 47, idfCount: 1, unitCount: 72 });
    expect(qtyOf(bom, 'SW-8')).toBe(4);
    expect(qtyOf(bom, 'SW-24')).toBe(1);
    expect(qtyOf(bom, 'SW-48')).toBe(3);
    // Amenity APs use the same tagged AP as the units; outdoor falls back to
    // the legacy outdoor SKU when no AP is tagged mount_type 'outdoor'.
    expect(qtyOf(bom, 'AP-22W')).toBe(119 + 3);
    expect(bom.items.find((i) => i.sku === 'AP-22W' && /Amenity/.test(i.note)).qty).toBe(3);
    expect(bom.totalAPs).toBe(119 + 3 + 2);
    expect(qtyOf(bom, 'XV2-2X')).toBe(0);
    expect(qtyOf(bom, 'XV2-23T')).toBe(2);
    // No in-unit SKU chosen → counted, no line.
    expect(qtyOf(bom, 'TL-SG105')).toBe(0);
  });

  it('an in-unit switch SKU adds the line; room overrides replace the computed mix', () => {
    const bom = run({ ...EXTENDED, inUnitSwitchSku: 'TL-SG105', roomOverrides: { idf: { s8: 1, s24: 1, s48: 1 } } });
    expect(qtyOf(bom, 'TL-SG105')).toBe(47);
    const idf = bom.idfPlan.find((p) => p.name === 'B2 IDF');
    expect(idf).toMatchObject({ s8: 1, s24: 1, s48: 1, overridden: true });
    expect(bom.idfSwitches8).toBe(5);
    expect(bom.idfSwitches48).toBe(2);
  });

  it('switchPerTownhome off packs the townhome units nowhere (their room is skipped) and the lists can be ignored', () => {
    const bom = run({ ...EXTENDED, switchPerTownhome: false, useLocationLists: false }, { publicAreaAPs: 7, outdoorAPs: 1 });
    expect(bom.idfSwitches8).toBe(0);
    expect(bom.idfPlan).toHaveLength(2);
    expect(bom.totalAPs).toBe(119 + 7 + 1);
  });

  it('overhead 0 lets a 24-port carry 18 by ports but PoE still caps it at 16', () => {
    const small = { ...model(), unitTypes: [{ id: 'u', code: 'A', bedrooms: 1, kind: 'apartment', sqft: 500, counts: { l3: 17 } }] };
    const at20 = calculateBOM(INPUTS, {}, {}, PRODUCTS, [], null, buildWifiTakeoff(small, { enabled: true, portOverheadPct: 20 }));
    const at0 = calculateBOM(INPUTS, {}, {}, PRODUCTS, [], null, buildWifiTakeoff(small, { enabled: true, portOverheadPct: 0 }));
    expect(at20.idfPlan.find((p) => p.name === 'B2 IDF')).toMatchObject({ s24: 0, s48: 1 });
    expect(at0.idfPlan.find((p) => p.name === 'B2 IDF')).toMatchObject({ s24: 0, s48: 1 });
  });

  it('without tags the small class falls back to the 24-port SKU with a note', () => {
    const bom = calculateBOM(INPUTS, {}, {}, BASE_PRODUCTS, [], null, buildWifiTakeoff(model(), { enabled: true }));
    const line = bom.items.find((i) => i.sku === 'MX-EX2028PxA-U' && /no 8-port class/.test(i.note));
    expect(line?.qty).toBe(4);
  });

  it('labor and scope read the takeoff counts off the BOM', () => {
    const bom = run(EXTENDED);
    const hours = estimateLaborHours({ wifiBom: bom, cameraBom: {}, inputs: { ...INPUTS, numberOfIDFs: 9 }, cameraInputs: {} });
    const classicHours = estimateLaborHours({ wifiBom: { ...bom, idfCount: undefined }, cameraBom: {}, inputs: { ...INPUTS, numberOfIDFs: 9 }, cameraInputs: {} });
    expect(hours['install-tech']).toBeLessThan(classicHours['install-tech']); // 1 IDF, not 9
    const scope = buildScopeOfWork({ inputs: { ...INPUTS, numberOfRooms: 100 }, cameraInputs: {}, wifiBom: bom, cameraBom: { totalCameras: 0 }, term: { summaryUnit: 'apartments' } });
    expect(scope[0].text).toContain('72 apartments');
    expect(scope[0].text).toContain('1 network closet');
  });

  it('the classic path is byte-identical with or without the takeoff argument', () => {
    const products = PRODUCTS;
    const a = calculateBOM(INPUTS, {}, {}, products, [], null);
    const b = calculateBOM(INPUTS, {}, {}, products, [], null, null);
    const c = calculateBOM(INPUTS, {}, {}, products, [], null, { enabled: false });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.takeoffUsed).toBe(false);
    expect(a.idfPlan).toEqual([]);
    expect(a.idfSwitches8).toBe(0);
    expect(a.idfCount).toBe(INPUTS.numberOfIDFs);
  });
});
