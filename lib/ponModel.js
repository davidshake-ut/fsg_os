// XGS-PON / FTTU — complex-project Builder, Phase 8. The architecture
// choice on a Digital Infrastructure design and the PON sizing rules. No
// imports, so the property model can normalize with these and the takeoff
// can derive from plain counts (the pattern lib/cablingRuns.js set).
//
// Persists at inputs.techCalc.digital_infrastructure:
//   architecture: 'active_ethernet' | 'xgs_pon'
//   pon: { splitRatio, ontPer, oltPorts, oltRedundantPsu, injectorPerOnt,
//          uplinksPerOlt, onuCount (null = one per townhome room), hours, skus }
//
// Under XGS-PON the fiber to each unit is lit: an ONT sits at every in-unit
// AP (or one per unit), powered through a PoE injector; 1:N splitters in
// the IDF kits feed off an OLT's PON ports; the IDF closets carry no PoE
// switches, so only the amenity / outdoor APs still ride a switch.

export const ARCHITECTURES = ['active_ethernet', 'xgs_pon'];
export const ARCHITECTURE_LABELS = { active_ethernet: 'Active Ethernet', xgs_pon: 'XGS-PON (FTTU)' };
export const ONT_PER = ['ap', 'unit'];

// The FTTU variants the base catalog seeds for the default telecom-room
// kits: choosing the architecture swaps a default kit for its variant.
export const FTTU_KIT_SKUS = { 'KIT-MDF-22U': 'KIT-MDF-22U-FTTU', 'KIT-IDF-12U': 'KIT-IDF-12U-FTTU' };

export const PON_SKU_DEFAULTS = {
  olt: 'TCX16-0A00',
  oltPsu: 'PSU-OLT-AC-0A',
  ponOptic: 'SFP-XGS-CP-0A',
  oltSupport: 'CCADV-SUP-TCX16-5',
  uplinkOptic: 'SFP-10G-LR',
  ont: 'SXX00-0A01',
  ontSupport: 'CCADV-SUP-SXX00-5',
  injector: 'C000000L141A',
  injectorCord: 'N000900L031A',
  onu: 'SXS00-0A00',
};

export const PON_DEFAULTS = {
  splitRatio: 32,
  ontPer: 'ap',
  oltPorts: 16,
  oltRedundantPsu: true,
  injectorPerOnt: true,
  uplinksPerOlt: 2,
  onuCount: null,
  hours: { ontProvisioning: 0.5, ponActivation: 0.5 },
  skus: PON_SKU_DEFAULTS,
};

// The quoted PON roles in BOM order. countKey picks the derived quantity;
// licenseOf marks a support subscription that prices at its device's markup.
export const PON_ROLES = [
  { key: 'olt', label: 'XGS-PON OLT', countKey: 'olts', category: 'OLT', hint: 'One per block of PON ports' },
  { key: 'oltPsu', label: 'OLT power supply', countKey: 'oltPsus', category: 'OLT', hint: 'Two per OLT when redundant' },
  { key: 'ponOptic', label: 'XGS-PON OLT optic', countKey: 'ponOptics', category: 'PON Optic', hint: 'One per splitter (PON port in use)' },
  { key: 'oltSupport', label: 'OLT support (5-year)', countKey: 'oltSupports', category: 'License', licenseOf: 'olt', hint: 'One per OLT' },
  { key: 'uplinkOptic', label: '10G uplink optic', countKey: 'uplinkOptics', category: 'Fiber Module', hint: 'OLT to core uplinks' },
  { key: 'ont', label: 'XGS-PON ONT', countKey: 'onts', category: 'ONT', hint: 'One per in-unit AP, or one per unit' },
  { key: 'ontSupport', label: 'ONT support (5-year)', countKey: 'onts', category: 'License', licenseOf: 'ont', hint: 'One per ONT' },
  { key: 'injector', label: 'PoE injector (AP power)', countKey: 'injectors', category: 'PoE Injector', hint: 'One per ONT-fed AP' },
  { key: 'injectorCord', label: 'Injector power cord', countKey: 'injectorCords', category: 'PoE Injector', hint: 'One per injector' },
  { key: 'onu', label: 'Multi-port ONU (townhome racks)', countKey: 'onus', category: 'ONT', hint: 'One per townhome rack unless entered' },
];

const n0 = (v) => Math.max(0, Number(v) || 0);
const clean = (s) => String(s ?? '').trim();

export function normalizeArchitecture(raw) {
  return ARCHITECTURES.includes(raw) ? raw : 'active_ethernet';
}

export function normalizePon(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const h = r.hours && typeof r.hours === 'object' ? r.hours : {};
  const s = r.skus && typeof r.skus === 'object' ? r.skus : {};
  const skus = {};
  for (const [key, def] of Object.entries(PON_SKU_DEFAULTS)) skus[key] = clean(s[key]) || def;
  const onuRaw = r.onuCount;
  const onuCount = onuRaw === null || onuRaw === undefined || onuRaw === '' || !Number.isFinite(Number(onuRaw)) ? null : Math.round(n0(onuRaw));
  const ratio = Math.round(n0(r.splitRatio));
  const ports = Math.round(n0(r.oltPorts));
  return {
    splitRatio: ratio > 0 ? ratio : PON_DEFAULTS.splitRatio,
    ontPer: ONT_PER.includes(r.ontPer) ? r.ontPer : PON_DEFAULTS.ontPer,
    oltPorts: ports > 0 ? ports : PON_DEFAULTS.oltPorts,
    oltRedundantPsu: r.oltRedundantPsu !== false,
    injectorPerOnt: r.injectorPerOnt !== false,
    uplinksPerOlt: r.uplinksPerOlt === undefined || r.uplinksPerOlt === null ? PON_DEFAULTS.uplinksPerOlt : Math.round(n0(r.uplinksPerOlt)),
    onuCount,
    hours: {
      ontProvisioning: h.ontProvisioning === undefined || h.ontProvisioning === null ? PON_DEFAULTS.hours.ontProvisioning : n0(h.ontProvisioning),
      ponActivation: h.ponActivation === undefined || h.ponActivation === null ? PON_DEFAULTS.hours.ponActivation : n0(h.ponActivation),
    },
    skus,
  };
}

// The PON quantities from plain counts: in-unit APs, units, and the
// number of townhome-only telecom rooms (each hosts a multi-port ONU).
export function derivePonCounts(pon, { unitAPs = 0, units = 0, townhomeRooms = 0 } = {}) {
  const p = normalizePon(pon);
  const onts = Math.round(p.ontPer === 'unit' ? n0(units) : n0(unitAPs));
  const splitters = onts > 0 ? Math.ceil(onts / p.splitRatio) : 0;
  const olts = splitters > 0 ? Math.ceil(splitters / p.oltPorts) : 0;
  const injectors = p.injectorPerOnt ? onts : 0;
  const onuDerived = p.onuCount === null;
  return {
    onts,
    splitters,
    olts,
    oltPsus: olts * (p.oltRedundantPsu ? 2 : 1),
    ponOptics: splitters,
    oltSupports: olts,
    uplinkOptics: olts * p.uplinksPerOlt,
    injectors,
    injectorCords: injectors,
    onus: onuDerived ? Math.round(n0(townhomeRooms)) : p.onuCount,
    onuDerived,
    splitRatio: p.splitRatio,
    ponPortsUsed: splitters,
    ponPortsAvailable: olts * p.oltPorts,
  };
}
