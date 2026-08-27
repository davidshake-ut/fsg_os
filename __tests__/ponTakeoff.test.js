import { describe, it, expect } from 'vitest';
import { PON_DEFAULTS, ARCHITECTURE_LABELS, normalizePon, normalizeArchitecture, derivePonCounts } from '../lib/ponModel';
import { derivePon, computePonLines, ponLaborHours, effectiveKitSkus, townhomeRoomCount, isPon } from '../lib/ponTakeoff';
import { normalizePropertyModel, KIT_DEFAULTS, guessUnitScheduleMapping, parseUnitSchedule, propertyFromImport } from '../lib/propertyModel';
import { deriveCablingRuns } from '../lib/cablingTakeoff';
import { computeKitLines, computeInfrastructureLines, infrastructureLaborHours } from '../lib/infrastructureLines';
import { buildWifiTakeoff } from '../lib/wifiTakeoff';
import { calculateBOM } from '../lib/calculateBOM';
import { DEFAULT_INPUTS } from '../lib/defaults';
import { mergeProducts } from '../lib/mergeProducts';
import { rollUpAssemblies } from '../lib/assemblies';
import { normalizePricingPolicy, applyPricingPolicy } from '../lib/pricingPolicy';
import { parseDelimited } from '../lib/csv';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';

const muzeModel = (extra = {}) => {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  return normalizePropertyModel({ ...propertyFromImport(parseUnitSchedule(rows, guessUnitScheduleMapping(rows))), ...extra });
};
const extendedWifi = { enabled: true, apsPerClass: { 3: 2, th: 2 } };
const catalog = () => rollUpAssemblies(mergeProducts([]));

describe('ponModel', () => {
  it('normalizes the architecture and the PON settings with defaults', () => {
    expect(normalizeArchitecture('xgs_pon')).toBe('xgs_pon');
    expect(normalizeArchitecture('bogus')).toBe('active_ethernet');
    expect(ARCHITECTURE_LABELS.xgs_pon).toContain('XGS-PON');
    expect(normalizePon(undefined)).toEqual(PON_DEFAULTS);
    const p = normalizePon({ splitRatio: '16', ontPer: 'unit', oltRedundantPsu: false, onuCount: '3', hours: { ontProvisioning: 1 }, skus: { olt: ' MY-OLT ' } });
    expect(p).toMatchObject({ splitRatio: 16, ontPer: 'unit', oltRedundantPsu: false, onuCount: 3, hours: { ontProvisioning: 1, ponActivation: 0.5 } });
    expect(p.skus.olt).toBe('MY-OLT');
    expect(p.skus.ont).toBe(PON_DEFAULTS.skus.ont);
    expect(normalizePon({ onuCount: '' }).onuCount).toBeNull();
  });
  it('derives the PON counts: ONT per AP, ceil splitters and OLTs, PSUs, optics, injectors, ONUs', () => {
    const c = derivePonCounts(PON_DEFAULTS, { unitAPs: 438, units: 400, townhomeRooms: 1 });
    expect(c).toMatchObject({ onts: 438, splitters: 14, olts: 1, oltPsus: 2, ponOptics: 14, oltSupports: 1, uplinkOptics: 2, injectors: 438, injectorCords: 438, onus: 1, onuDerived: true, ponPortsUsed: 14, ponPortsAvailable: 16 });
    expect(derivePonCounts({ ontPer: 'unit' }, { unitAPs: 438, units: 400 }).onts).toBe(400);
    expect(derivePonCounts({ ontPer: 'unit' }, { unitAPs: 438, units: 400 }).splitters).toBe(13);
    expect(derivePonCounts({ oltPorts: 8, oltRedundantPsu: false, injectorPerOnt: false, onuCount: 4 }, { unitAPs: 438 })).toMatchObject({ olts: 2, oltPsus: 2, injectors: 0, onus: 4, onuDerived: false });
    expect(derivePonCounts(PON_DEFAULTS, { unitAPs: 0 })).toMatchObject({ onts: 0, splitters: 0, olts: 0, oltPsus: 0, uplinkOptics: 0 });
  });
});

describe('ponTakeoff on the Muze property', () => {
  it('sizes from the Wi-Fi coverage rules: 438 ONTs, 14 splitters, one OLT; the townhome room hosts the ONU', () => {
    const model = muzeModel({ architecture: 'xgs_pon' });
    expect(isPon(model)).toBe(true);
    expect(townhomeRoomCount(model)).toBe(1);
    const d = derivePon(model, { inputs: { wifiTakeoff: extendedWifi } });
    expect(d).toMatchObject({ architecture: 'xgs_pon', unitAPs: 438, units: 400, onts: 438, splitters: 14, olts: 1, onus: 1 });
    // Without the coverage rules: one AP per unit.
    expect(derivePon(model, {}).onts).toBe(400);
    expect(derivePon(muzeModel({ architecture: 'xgs_pon', pon: { onuCount: 4 } }), {}).onus).toBe(4);
  });

  it('prices the PON lines from the catalog; support subscriptions inherit their device markup under cost-plus', () => {
    const model = muzeModel({ architecture: 'xgs_pon', pon: { onuCount: 4 } });
    const ctx = { inputs: { wifiTakeoff: extendedWifi } };
    const costPlus = applyPricingPolicy(catalog(), normalizePricingPolicy({ mode: 'costPlus' }));
    const lines = computePonLines(model, costPlus, ctx);
    expect(lines.map((l) => [l.role, l.qty])).toEqual([
      ['olt', 1], ['oltPsu', 2], ['ponOptic', 14], ['oltSupport', 1], ['uplinkOptic', 2],
      ['ont', 438], ['ontSupport', 438], ['injector', 438], ['injectorCord', 438], ['onu', 4],
    ]);
    expect(lines.every((l) => !l.missing)).toBe(true);
    const by = Object.fromEntries(lines.map((l) => [l.role, l]));
    expect(by.olt.price).toBeCloseTo(8588.42 * 1.5, 6); // OLT 50%
    expect(by.oltSupport.price).toBeCloseTo(4332 * 1.5, 6); // inherits the OLT's 50%
    expect(by.ontSupport.price).toBeCloseTo(36 * 1.5, 6); // inherits the ONT's 50%
    expect(by.uplinkOptic.price).toBeCloseTo(109 * 1.6, 6); // Fiber Module 60%
    // List prices under the catalog mode.
    const list = computePonLines(model, catalog(), ctx);
    expect(Object.fromEntries(list.map((l) => [l.role, l.price]))).toMatchObject({ olt: 12496.15, oltSupport: 6303.06, ontSupport: 52.38 });
    // A SKU missing from the catalog is flagged, not dropped; Active Ethernet quotes nothing.
    const missing = computePonLines(muzeModel({ architecture: 'xgs_pon', pon: { skus: { ont: 'NOPE' } } }), catalog(), ctx);
    expect(missing.find((l) => l.role === 'ont')).toMatchObject({ missing: true, qty: 438, cost: 0 });
    expect(computePonLines(muzeModel(), catalog(), ctx)).toEqual([]);
  });

  it('adds provisioning + activation hours to Digital Infrastructure labor only under XGS-PON', () => {
    const ctx = { inputs: { wifiTakeoff: extendedWifi } };
    expect(ponLaborHours(muzeModel({ architecture: 'xgs_pon' }), ctx)['install-tech']).toBe(438 * 0.5 + 14 * 0.5); // 226
    expect(ponLaborHours(muzeModel(), ctx)['install-tech']).toBe(0);
    expect(infrastructureLaborHours(muzeModel({ architecture: 'xgs_pon' }), ctx)['install-tech']).toBe(560 + 226);
    expect(infrastructureLaborHours(muzeModel(), ctx)['install-tech']).toBe(560);
  });

  it('the default kits follow the architecture; a chosen kit is kept', () => {
    expect(effectiveKitSkus(muzeModel())).toEqual({ mdfSku: KIT_DEFAULTS.mdfSku, idfSku: KIT_DEFAULTS.idfSku });
    expect(effectiveKitSkus(muzeModel({ architecture: 'xgs_pon' }))).toEqual({ mdfSku: 'KIT-MDF-22U-FTTU', idfSku: 'KIT-IDF-12U-FTTU' });
    expect(effectiveKitSkus(muzeModel({ architecture: 'xgs_pon', kits: { idfSku: 'KIT-IDF-12U-FTTU', mdfSku: 'KIT-MDF-22U' } })).mdfSku).toBe('KIT-MDF-22U-FTTU');
    expect(effectiveKitSkus(muzeModel({ architecture: 'xgs_pon', kits: { mdfSku: 'MY-KIT' } })).mdfSku).toBe('MY-KIT');
    const kits = computeKitLines(muzeModel({ architecture: 'xgs_pon' }), catalog()).filter((l) => l.category === 'Rack');
    expect(kits.map((l) => [l.sku, l.qty])).toEqual([['KIT-MDF-22U-FTTU', 1], ['KIT-IDF-12U-FTTU', 18]]);
    expect(kits[1].cost).toBeCloseTo(3889.31, 2);
    // Kits, PON gear, and cabling all come out of one compute.
    const all = computeInfrastructureLines(muzeModel({ architecture: 'xgs_pon' }), catalog(), { inputs: { wifiTakeoff: extendedWifi } });
    expect(all.some((l) => l.role === 'ont')).toBe(true);
    expect(all.some((l) => l.runKey === 'unitFiber')).toBe(true);
  });

  it('cabling: the Cat6 run to the unit derives to zero under XGS-PON (an entered count keeps it)', () => {
    expect(deriveCablingRuns(muzeModel(), {}).unitCat6.derived).toBe(400);
    const pon = deriveCablingRuns(muzeModel({ architecture: 'xgs_pon' }), {});
    expect(pon.unitCat6.derived).toBe(0);
    expect(pon.unitCat6.hint).toContain('XGS-PON');
    expect(pon.unitFiber.derived).toBe(400);
    expect(deriveCablingRuns(muzeModel({ architecture: 'xgs_pon', cabling: { runs: { unitCat6: { qty: 50 } } } }), {}).unitCat6.qty).toBe(50);
  });
});

// A tagged Wi-Fi 7 gear set for the engine (subscriptions linked as
// 5-year licenses; the 24-port has room for 22 switch-fed APs at 0% spare).
const GEAR = [
  { sku: 'T-SUB', desc: 'sub', category: 'Subscription', technology: 'managed_wifi', vendor: 'T', cost: 10, price: 20 },
  { sku: 'T-GW', desc: 'gateway', category: 'Gateway', technology: 'managed_wifi', vendor: 'T', cost: 1000, price: 1500, quality_tier: 'better' },
  { sku: 'T-CORE', desc: 'core', category: 'Aggregate Switch', technology: 'managed_wifi', vendor: 'T', cost: 1500, price: 2000, quality_tier: 'better', license_sku_5yr: 'T-SUB' },
  { sku: 'T-AP', desc: 'AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'T', cost: 300, price: 450, mount_type: 'ceiling', quality_tier: 'better', poe_watts: 20, license_sku_5yr: 'T-SUB' },
  { sku: 'T-OUT', desc: 'outdoor AP', category: 'Access Point', technology: 'managed_wifi', vendor: 'T', cost: 250, price: 370, mount_type: 'outdoor', quality_tier: 'better', poe_watts: 15, license_sku_5yr: 'T-SUB' },
  { sku: 'T-SW8', desc: '8-port', category: 'Switch', technology: 'managed_wifi', vendor: 'T', cost: 400, price: 600, quality_tier: 'better', port_count: 8, poe_budget_watts: 124, license_sku_5yr: 'T-SUB' },
  { sku: 'T-SW24', desc: '24-port', category: 'Switch', technology: 'managed_wifi', vendor: 'T', cost: 700, price: 1000, quality_tier: 'better', port_count: 28, poe_budget_watts: 600, license_sku_5yr: 'T-SUB' },
  { sku: 'T-SW48', desc: '48-port', category: 'Switch', technology: 'managed_wifi', vendor: 'T', cost: 1400, price: 2000, quality_tier: 'better', port_count: 52, poe_budget_watts: 1200, license_sku_5yr: 'T-SUB' },
];

describe('Wi-Fi engine under XGS-PON', () => {
  const lists = {
    amenityLocations: Array.from({ length: 13 }, (_, i) => ({ id: `a${i}`, name: `Amenity ${i}`, qty: 1 })),
    outdoorLocations: [{ id: 'o1', name: 'Pool', qty: 9 }],
  };
  const settings = { ...extendedWifi, portOverheadPct: 0, redundantGateway: true };
  const inputs = { ...DEFAULT_INPUTS, includeWifi: true, wifiQuality: 'better', licenseTerm: 5, includeShipping: false, wifiTakeoff: settings };
  const products = catalog().concat(GEAR);

  it('leaves unit APs off the closet switches, packs the amenity + outdoor APs at the MDF, and skips townhome switches and fiber links', () => {
    const ae = calculateBOM(inputs, {}, {}, products, [], null, buildWifiTakeoff(muzeModel(lists), settings, { kitsQuoted: true }));
    const takeoff = buildWifiTakeoff(muzeModel({ ...lists, architecture: 'xgs_pon' }), settings, { kitsQuoted: true });
    expect(takeoff.architecture).toBe('xgs_pon');
    const pon = calculateBOM(inputs, {}, {}, products, [], null, takeoff);
    expect(pon.ponMode).toBe(true);
    expect(ae.ponMode).toBe(false);
    expect(pon.totalAPs).toBe(ae.totalAPs); // 438 + 13 + 9 — the APs don't change, their power does
    expect(pon.totalAPs).toBe(460);
    expect(ae.idfSwitches8).toBe(16); // one per townhome under Active Ethernet
    expect({ s8: pon.idfSwitches8, s24: pon.idfSwitches24, s48: pon.idfSwitches48 }).toEqual({ s8: 0, s24: 1, s48: 0 });
    const mdf = pon.idfPlan.find((p) => p.isMdf);
    expect(mdf).toMatchObject({ aps: 22, s24: 1, pon: true });
    expect(mdf.unitAps).toBeGreaterThan(0);
    expect(pon.idfPlan.filter((p) => !p.isMdf).every((p) => p.aps === 0 && p.s8 + p.s24 + p.s48 === 0 && !p.townhome)).toBe(true);
    expect(pon.needsAggSwitch).toBe(true);
    expect(pon.items.some((i) => i.sku === 'SFP-10G-SR')).toBe(false);
    expect(ae.items.some((i) => i.sku === 'SFP-10G-SR')).toBe(true);
    expect(pon.inUnitSwitches).toBe(38); // still the multi-AP rule
  });

  it('can put an in-unit switch in every unit (a private LAN behind each ONT)', () => {
    const takeoff = buildWifiTakeoff(muzeModel({ ...lists, architecture: 'xgs_pon' }), { ...settings, inUnitSwitchEveryUnit: true, inUnitSwitchSku: 'T-SW8' }, { kitsQuoted: true });
    expect(takeoff.inUnitSwitchEveryUnit).toBe(true);
    const bom = calculateBOM(inputs, {}, {}, products, [], null, takeoff);
    expect(bom.inUnitSwitches).toBe(400);
    expect(bom.items.find((i) => i.sku === 'T-SW8' && /every unit/.test(i.note)).qty).toBe(400);
  });
});
