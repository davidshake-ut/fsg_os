// Wi-Fi takeoff from the property model (complex-project Builder, Phase 2).
// Turns the Digital Infrastructure property model plus this quote's
// coverage settings into what calculateBOM needs to size a multi-building
// design: unit APs from per-class rules, APs per telecom room, the
// townhome and in-unit switch counts, and amenity / outdoor counts from
// the named lists. Pure.
//
// Settings persist at inputs.wifiTakeoff (a sub-object of the quote's
// inputs jsonb — no migration):
//   enabled                design from the property model instead of rooms / ratio
//   defaultApsPerUnit      APs for any unit class without its own rule
//   apsPerClass            { '1': 1, '3': 2, th: 2 } keyed by lib/propertyModel unitClassOf
//   portOverheadPct        spare switch ports as a % of APs (the takeoff's 20%)
//   switchPerTownhome      every townhome unit hosts its own small (8-class) PoE switch
//   inUnitSwitchForMultiAp units designed with 2+ APs get an unmanaged in-unit switch
//   inUnitSwitchSku        catalog SKU for that switch ('' = count only, no line)
//   useLocationLists       amenity / outdoor AP counts come from the property's named lists
//   roomOverrides          { [roomId]: { s8, s24, s48 } } hand-set switch mix for a room
//   redundantGateway       quote two gateways / routers (a redundant pair)
//   itemizeAccessories     list the gateway UPS / optics and patch cables as lines
//                          (off = they ride in the misc-hardware allowance)

import { normalizePropertyModel, propertyTotals, unitClassOf, sortUnitClasses } from './propertyModel';

export const WIFI_TAKEOFF_DEFAULTS = {
  enabled: false,
  defaultApsPerUnit: 1,
  apsPerClass: {},
  portOverheadPct: 20,
  switchPerTownhome: true,
  inUnitSwitchForMultiAp: true,
  inUnitSwitchSku: '',
  useLocationLists: true,
  roomOverrides: {},
  redundantGateway: false,
  itemizeAccessories: false,
};

const n0 = (v) => Math.max(0, Number(v) || 0);

export function apsForClass(settings, cls) {
  const raw = settings?.apsPerClass?.[cls];
  if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(Number(raw))) return n0(raw);
  return n0(settings?.defaultApsPerUnit ?? WIFI_TAKEOFF_DEFAULTS.defaultApsPerUnit);
}

// Unit classes the property actually has, studio → … → townhome.
export function unitClassesPresent(model) {
  return sortUnitClasses(Object.keys(propertyTotals(normalizePropertyModel(model)).byClass));
}

// ctx.kitsQuoted (optional): whether Digital Infrastructure is quoting its
// telecom-room kits on this proposal — when it is, the Wi-Fi engine must
// not add its legacy rack lines too. Defaults to "the model has kits".
export function buildWifiTakeoff(model, settingsIn, ctx = {}) {
  const settings = { ...WIFI_TAKEOFF_DEFAULTS, ...(settingsIn ?? {}) };
  const m = normalizePropertyModel(model);
  const totals = propertyTotals(m);
  const kitsConfigured =
    m.rooms.length > 0 &&
    (!!m.kits.mdfSku || !!m.kits.idfSku || Object.values(m.kits.roomKitSku).some((s) => s && s !== 'none'));
  const racksFromKits = kitsConfigured && (ctx.kitsQuoted === undefined || ctx.kitsQuoted === null ? true : !!ctx.kitsQuoted);

  // APs per level and per class from the coverage rules.
  const apsByLevel = Object.fromEntries(m.levels.map((l) => [l.id, 0]));
  const apsByClass = {};
  let unitAPs = 0;
  let multiApUnits = 0;
  let townhomeUnits = 0;
  let townhomeAPs = 0;
  for (const u of m.unitTypes) {
    const cls = unitClassOf(u);
    const per = apsForClass(settings, cls);
    for (const [lid, c] of Object.entries(u.counts)) {
      if (!(lid in apsByLevel)) continue;
      apsByLevel[lid] += c * per;
      unitAPs += c * per;
      apsByClass[cls] = (apsByClass[cls] ?? 0) + c * per;
      if (per > 1) multiApUnits += c;
      if (u.kind === 'townhome') {
        townhomeUnits += c;
        townhomeAPs += c * per;
      }
    }
  }

  // One entry per telecom room: its levels' APs and units. A room whose
  // units are all townhomes is flagged so the engine gives each unit its
  // own switch instead of packing a closet.
  const levelName = Object.fromEntries(m.levels.map((l) => [l.id, l.name]));
  const rooms = m.rooms.map((r) => {
    const levelIds = m.levels.filter((l) => l.roomId === r.id).map((l) => l.id);
    const aps = levelIds.reduce((s, lid) => s + apsByLevel[lid], 0);
    const units = levelIds.reduce((s, lid) => s + (totals.byLevel[lid]?.units ?? 0), 0);
    const thUnits = levelIds.reduce((s, lid) => s + (totals.byLevel[lid]?.byClass?.th ?? 0), 0);
    const ov = settings.roomOverrides?.[r.id];
    const overrides = ov ? { s8: n0(ov.s8), s24: n0(ov.s24), s48: n0(ov.s48) } : null;
    return {
      id: r.id,
      name: r.name,
      isMdf: !!r.isMdf,
      levelIds,
      levelNames: levelIds.map((lid) => levelName[lid]),
      units,
      aps,
      townhome: units > 0 && thUnits === units,
      townhomeUnits: thUnits,
      overrides,
    };
  });

  const unassignedLevelIds = m.levels.filter((l) => !l.roomId).map((l) => l.id);
  const unassignedAPs = unassignedLevelIds.reduce((s, lid) => s + apsByLevel[lid], 0);

  const listSum = (list) => list.reduce((s, i) => s + i.qty, 0);
  const amenityAPs = settings.useLocationLists ? listSum(m.amenityLocations) : null;
  const outdoorAPs = settings.useLocationLists ? listSum(m.outdoorLocations) : null;
  const otherDrops = m.otherDrops.filter((d) => d.included).reduce((s, d) => s + d.qty, 0);

  return {
    enabled: !!settings.enabled,
    rooms,
    idfRooms: rooms.filter((r) => !r.townhome && !r.isMdf).length,
    units: totals.units,
    unitAPs,
    apsByLevel,
    apsByClass,
    multiApUnits,
    townhomeUnits,
    townhomeAPs,
    unassignedLevelIds,
    unassignedAPs,
    amenityAPs,
    outdoorAPs,
    otherDrops,
    overheadPct: n0(settings.portOverheadPct),
    switchPerTownhome: !!settings.switchPerTownhome,
    inUnitSwitchForMultiAp: !!settings.inUnitSwitchForMultiAp,
    inUnitSwitchSku: String(settings.inUnitSwitchSku ?? '').trim(),
    redundantGateway: !!settings.redundantGateway,
    itemizeAccessories: !!settings.itemizeAccessories,
    racksFromKits,
  };
}

// Whether a quote can design from its property model at all.
export function propertyModelHasUnits(model) {
  return propertyTotals(normalizePropertyModel(model)).units > 0;
}
