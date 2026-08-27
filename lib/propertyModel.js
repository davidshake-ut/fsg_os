// Property model — the Digital Infrastructure calculator's design inputs
// (complex-project Builder, Phase 1). Pure: shapes, normalization, totals,
// and the unit-schedule importer. Persists per quote at
// inputs.techCalc.digital_infrastructure (rides the inputs jsonb — no
// migration). Later phases read it: Wi-Fi coverage/IDF sizing (2), rack
// kits per telecom room (3), structured cabling (4).
//
// Shapes:
//   building  { id, name }
//   level     { id, buildingId, name, roomId }   roomId → the telecom room (IDF/MDF) serving it
//   room      { id, name, isMdf }                exactly one room should be the MDF
//   unitType  { id, code, description, bedrooms, kind: 'apartment' | 'townhome', sqft,
//               counts: { [levelId]: n } }       how many of this type on each level
//   location  { id, name, qty }                  amenity / outdoor AP spots (qty = APs there)
//   drop      { id, name, qty, included }        other network drops (elevators, fire alarm…)

// Kit choices (Phase 3): which catalog kit each telecom room and each
// unit's media panel quote as, a per-room override ('none' = no kit), and
// the install hours those kits carry. Defaults point at the base-catalog
// kits seeded from the Muze rack schedule (lib/catalog.js).
export const KIT_DEFAULTS = {
  mdfSku: 'KIT-MDF-22U',
  idfSku: 'KIT-IDF-12U',
  mediaPanelSku: 'KIT-MEDIA-PANEL',
  mediaPanelPerUnit: true,
  roomKitSku: {},
  installHours: { mdf: 16, idf: 8, mediaPanel: 1 },
};

export const PROPERTY_MODEL_DEFAULTS = {
  buildings: [],
  levels: [],
  rooms: [],
  unitTypes: [],
  amenityLocations: [],
  outdoorLocations: [],
  otherDrops: [],
  notes: '',
  kits: KIT_DEFAULTS,
};

export function newId(prefix = 'id') {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.floor(Math.random() * 1e8).toString(16)}`;
  return `${prefix}_${raw.slice(0, 8)}`;
}

const n0 = (v) => Math.max(0, Number(v) || 0);
const clean = (s) => String(s ?? '').trim();
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

// Coerce whatever is stored (or half-typed) into the shapes above. Counts
// for levels that no longer exist are dropped; a level whose room is gone
// becomes unassigned.
export function normalizePropertyModel(value) {
  const v = { ...PROPERTY_MODEL_DEFAULTS, ...(value ?? {}) };
  const arr = (x) => (Array.isArray(x) ? x : []);

  const buildings = arr(v.buildings)
    .filter((b) => b && b.id)
    .map((b) => ({ id: b.id, name: clean(b.name) || 'Building' }));
  const buildingIds = new Set(buildings.map((b) => b.id));

  const rooms = arr(v.rooms)
    .filter((r) => r && r.id)
    .map((r) => ({ id: r.id, name: clean(r.name) || 'Telecom room', isMdf: !!r.isMdf }));
  const roomIds = new Set(rooms.map((r) => r.id));

  const levels = arr(v.levels)
    .filter((l) => l && l.id && buildingIds.has(l.buildingId))
    .map((l) => ({
      id: l.id,
      buildingId: l.buildingId,
      name: clean(l.name) || 'Level',
      roomId: roomIds.has(l.roomId) ? l.roomId : null,
    }));
  const levelIds = new Set(levels.map((l) => l.id));

  const unitTypes = arr(v.unitTypes)
    .filter((u) => u && u.id)
    .map((u) => {
      const counts = {};
      for (const [lid, c] of Object.entries(u.counts ?? {})) {
        if (levelIds.has(lid) && n0(c) > 0) counts[lid] = n0(c);
      }
      return {
        id: u.id,
        code: clean(u.code),
        description: clean(u.description),
        bedrooms: n0(u.bedrooms),
        kind: u.kind === 'townhome' ? 'townhome' : 'apartment',
        sqft: n0(u.sqft),
        counts,
      };
    });

  const namedList = (x) =>
    arr(x)
      .filter((i) => i && i.id)
      .map((i) => ({ id: i.id, name: clean(i.name), qty: n0(i.qty) }));
  const otherDrops = arr(v.otherDrops)
    .filter((i) => i && i.id)
    .map((i) => ({ id: i.id, name: clean(i.name), qty: n0(i.qty), included: !!i.included }));

  const k = { ...KIT_DEFAULTS, ...(v.kits && typeof v.kits === 'object' ? v.kits : {}) };
  const hours = { ...KIT_DEFAULTS.installHours, ...(k.installHours && typeof k.installHours === 'object' ? k.installHours : {}) };
  const roomKitSku = {};
  for (const [id, sku] of Object.entries(k.roomKitSku && typeof k.roomKitSku === 'object' ? k.roomKitSku : {})) {
    if (roomIds.has(id) && clean(sku)) roomKitSku[id] = clean(sku);
  }
  const kits = {
    mdfSku: clean(k.mdfSku),
    idfSku: clean(k.idfSku),
    mediaPanelSku: clean(k.mediaPanelSku),
    mediaPanelPerUnit: k.mediaPanelPerUnit !== false,
    roomKitSku,
    installHours: { mdf: n0(hours.mdf), idf: n0(hours.idf), mediaPanel: n0(hours.mediaPanel) },
  };

  return {
    buildings,
    levels,
    rooms,
    unitTypes,
    amenityLocations: namedList(v.amenityLocations),
    outdoorLocations: namedList(v.outdoorLocations),
    otherDrops,
    notes: clean(v.notes),
    kits,
  };
}

// The class a coverage rule keys on: bedroom count for apartments ('0' =
// studio), 'th' for townhomes.
export function unitClassOf(unitType) {
  return unitType?.kind === 'townhome' ? 'th' : String(n0(unitType?.bedrooms));
}

export function unitClassLabel(cls) {
  if (cls === 'th') return 'Townhome';
  if (cls === '0') return 'Studio';
  return `${cls} BR`;
}

// Sorts classes studio → 1 BR → … → townhome.
export function sortUnitClasses(classes) {
  return [...classes].sort((a, b) => {
    if (a === 'th') return 1;
    if (b === 'th') return -1;
    return Number(a) - Number(b);
  });
}

// Levels in display order: buildings in their order, each building's
// levels in stored order.
export function orderedLevels(model) {
  const byBuilding = new Map();
  for (const l of model.levels) {
    if (!byBuilding.has(l.buildingId)) byBuilding.set(l.buildingId, []);
    byBuilding.get(l.buildingId).push(l);
  }
  return model.buildings.flatMap((b) => byBuilding.get(b.id) ?? []);
}

export function unitTypeTotal(unitType) {
  return sum(Object.values(unitType.counts ?? {}), n0);
}

// Everything the rail, the grid footer, and later phases need in one pass.
export function propertyTotals(model) {
  const byLevel = {};
  for (const l of model.levels) byLevel[l.id] = { units: 0, beds: 0, byClass: {} };
  const byBuilding = {};
  for (const b of model.buildings) byBuilding[b.id] = { units: 0, beds: 0 };
  const levelBuilding = Object.fromEntries(model.levels.map((l) => [l.id, l.buildingId]));
  const byClass = {};
  let units = 0;
  let beds = 0;
  let sqft = 0;

  for (const u of model.unitTypes) {
    const cls = unitClassOf(u);
    for (const [lid, c] of Object.entries(u.counts)) {
      if (!byLevel[lid]) continue;
      units += c;
      beds += c * u.bedrooms;
      sqft += c * u.sqft;
      byLevel[lid].units += c;
      byLevel[lid].beds += c * u.bedrooms;
      byLevel[lid].byClass[cls] = (byLevel[lid].byClass[cls] ?? 0) + c;
      const b = byBuilding[levelBuilding[lid]];
      if (b) {
        b.units += c;
        b.beds += c * u.bedrooms;
      }
      byClass[cls] = (byClass[cls] ?? 0) + c;
    }
  }

  const byRoom = {};
  for (const r of model.rooms) byRoom[r.id] = { units: 0, levelIds: [] };
  for (const l of model.levels) {
    if (l.roomId && byRoom[l.roomId]) {
      byRoom[l.roomId].units += byLevel[l.id].units;
      byRoom[l.roomId].levelIds.push(l.id);
    }
  }

  return {
    units,
    beds,
    sqft,
    unitTypes: model.unitTypes.length,
    buildings: model.buildings.length,
    levels: model.levels.length,
    rooms: model.rooms.length,
    byLevel,
    byBuilding,
    byClass,
    byRoom,
  };
}

// "Building 1" → "B1", "Townhomes" → "TH", anything else → first three
// letters. Used to name telecom rooms.
export function shortBuildingName(name) {
  const s = clean(name);
  const m = /(?:building|bldg)\s*#?\s*([a-z0-9]+)/i.exec(s);
  if (m) return `B${m[1].toUpperCase()}`;
  if (/townho/i.test(s)) return 'TH';
  return s.slice(0, 3).toUpperCase();
}

// The takeoff's default topology: every level is served by its own
// telecom room. Only levels without a room get one; the first room ever
// created becomes the MDF when none is designated.
export function ensureRoomPerLevel(model) {
  const rooms = [...model.rooms];
  const buildingName = Object.fromEntries(model.buildings.map((b) => [b.id, b.name]));
  const levels = model.levels.map((l) => {
    if (l.roomId) return l;
    const room = {
      id: newId('room'),
      name: `${shortBuildingName(buildingName[l.buildingId])} ${l.name}`.trim(),
      isMdf: false,
    };
    rooms.push(room);
    return { ...l, roomId: room.id };
  });
  if (rooms.length && !rooms.some((r) => r.isMdf)) rooms[0] = { ...rooms[0], isMdf: true };
  return { ...model, rooms, levels };
}

// ── Unit-schedule import ───────────────────────────────────────────────
// Input: the architect's unit mix as a 2-D array of strings (a pasted
// Excel range via parseDelimited, or a CSV). Header rows may be stacked
// (Excel's merged captions), unit rows are interleaved with section titles
// and subtotal rows, and total/percentage columns sit to the right — the
// guess handles the common layout and the mapping UI lets the user fix it.

const NUMERIC = /^-?\$?[\d,]*\.?\d+$/;
const isNumeric = (s) => NUMERIC.test(clean(s));

export function toNumber(s) {
  const t = clean(s).replace(/[^0-9.\-]/g, '');
  if (!t || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// One caption per column: the stacked header cells joined ("UNITS PER
// BUILDING LEVEL BLDG 1-BSMT"), whitespace collapsed.
export function columnHeaders(rows, headerRows) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, c) =>
    rows
      .slice(0, headerRows)
      .map((r) => clean(r[c]))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
  );
}

// A caption like "BLDG 1-LVL 3" / "Building B - Floor 2" / "TOWNHOMES" →
// { building, level, townhome, explicit }. building is null for a
// single-building schedule whose columns are just level names; explicit
// is false when the caption named a building but no level ("BLDG 2" is a
// per-building total column, not a level).
export function parseLevelHeader(header) {
  let s = clean(header)
    .replace(/\s+/g, ' ')
    .replace(/units per building level|units per level|units per building/gi, '')
    .trim();
  if (/townho|\bth\b/i.test(s)) return { building: 'Townhomes', level: 'Townhomes', townhome: true, explicit: true };
  let building = null;
  const bm = /(?:bldg|building)\s*#?\s*([a-z0-9]+)/i.exec(s);
  if (bm) {
    building = `Building ${bm[1].toUpperCase()}`;
    s = (s.slice(0, bm.index) + s.slice(bm.index + bm[0].length)).replace(/^[\s\-–—:/·|]+|[\s\-–—:/·|]+$/g, '');
  }
  let level;
  let explicit = true;
  if (/bsm?n?t|basement|lower level|garage|\bll\b/i.test(s)) level = 'Basement';
  else {
    const lm = /(?:lvl|level|floor|fl)\s*#?\s*([a-z0-9]+)/i.exec(s);
    if (lm) level = `Level ${lm[1].toUpperCase()}`;
    else {
      const nm = /\b(\d+)\b/.exec(s);
      if (nm) level = `Level ${nm[1]}`;
      else if (s) level = s;
      else {
        level = 'Level 1';
        explicit = false;
      }
    }
  }
  return { building, level, townhome: false, explicit };
}

// The level name shown for a caption: "Building 1 · Level 2", "Townhomes",
// or just "Level 3" for a single-building schedule.
export function levelHeaderName(header) {
  const p = parseLevelHeader(header);
  if (p.townhome) return 'Townhomes';
  return p.building ? `${p.building} · ${p.level}` : p.level;
}

export function guessUnitScheduleMapping(rows) {
  // Header rows: leading rows with several cells, mostly non-numeric.
  let headerRows = 0;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const cells = rows[i].map(clean).filter(Boolean);
    const numeric = cells.filter(isNumeric).length;
    if (cells.length >= 3 && numeric < cells.length / 2) headerRows += 1;
    else break;
  }
  if (headerRows === 0 && rows.length) headerRows = 1;

  const headers = columnHeaders(rows, headerRows);
  const lower = headers.map((h) => h.toLowerCase());
  const find = (re) => lower.findIndex((h) => re.test(h));

  const codeCol = Math.max(0, find(/unit\s*type|\bplan\b|\btype\b|\bcode\b/));
  const bedroomsCol = find(/\bbed/);
  const descriptionCol = find(/descr/);
  const sqftCol = find(/square|sq\.?\s*ft|sqft|\bsf\b|\barea\b/);
  const taken = new Set([codeCol, bedroomsCol, descriptionCol, sqftCol].filter((i) => i >= 0));

  const dataRows = rows.slice(headerRows);
  const levelCols = [];
  for (let c = 0; c < headers.length; c++) {
    if (taken.has(c)) continue;
    const h = lower[c];
    if (!h) continue;
    if (/per level|per building(?!\s*level)|total|percent|square|rentable|balcony|yard/.test(h)) continue;
    if (!/bldg|building|lvl|level|floor|bsm?n?t|basement|garage|townho|\bth\b/.test(h)) continue;
    // A building name alone ("BLDG 2") is a per-building total, not a level.
    if (!parseLevelHeader(headers[c]).explicit) continue;
    const vals = dataRows.map((r) => clean(r[c])).filter(Boolean);
    if (vals.length && vals.filter(isNumeric).length < vals.length * 0.8) continue;
    levelCols.push({ col: c, name: levelHeaderName(headers[c]) });
  }

  return { headerRows, headers, codeCol, bedroomsCol, descriptionCol, sqftCol, levelCols };
}

// Rows → unit types. A row counts as a unit type when it has a code and a
// numeric bedroom count; section titles, subtotals, and the TOTAL row fall
// out naturally. Counts are keyed by level-column index until
// propertyFromImport assigns level ids.
export function parseUnitSchedule(rows, mapping) {
  const { headerRows, codeCol, bedroomsCol, descriptionCol, sqftCol, levelCols } = mapping;
  const unitTypes = [];
  let skipped = 0;
  for (let i = headerRows; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const code = clean(r[codeCol]);
    const beds = bedroomsCol >= 0 ? toNumber(r[bedroomsCol]) : null;
    if (!code || beds === null) {
      if (code && !/total|units|townho/i.test(code)) skipped += 1;
      continue;
    }
    const description = descriptionCol >= 0 ? clean(r[descriptionCol]) : '';
    const sqft = sqftCol >= 0 ? toNumber(r[sqftCol]) ?? 0 : 0;
    const counts = {};
    levelCols.forEach((lc, idx) => {
      const n = toNumber(r[lc.col]);
      if (n && n > 0) counts[idx] = n;
    });
    // "TH1", "TH-2", "TH" are townhome codes; "Theater" is not.
    const kind = /^th(?![a-z])|townho/i.test(code) || /townho/i.test(description) ? 'townhome' : 'apartment';
    unitTypes.push({ code, description, bedrooms: Math.max(0, beds), kind, sqft: Math.max(0, sqft), counts });
  }
  return { unitTypes, levelNames: levelCols.map((l) => l.name), skipped };
}

// Parsed schedule → buildings / levels / rooms / unit types with fresh ids.
// Buildings come from the level captions in first-seen order; every level
// gets its own telecom room; the first room is the MDF until reassigned.
export function propertyFromImport({ unitTypes, levelNames }) {
  const buildings = [];
  const byName = new Map();
  const levels = [];
  const rooms = [];
  const townhomeLevelIds = new Set();

  levelNames.forEach((name) => {
    const p = parseLevelHeader(name);
    const bName = p.building ?? (p.townhome ? 'Townhomes' : 'Main Building');
    let b = byName.get(bName);
    if (!b) {
      b = { id: newId('bldg'), name: bName };
      byName.set(bName, b);
      buildings.push(b);
    }
    const room = {
      id: newId('room'),
      name: p.townhome ? 'TH' : `${shortBuildingName(bName)} ${p.level}`,
      isMdf: rooms.length === 0,
    };
    rooms.push(room);
    const level = { id: newId('lvl'), buildingId: b.id, name: p.level, roomId: room.id };
    levels.push(level);
    if (p.townhome) townhomeLevelIds.add(level.id);
  });

  const types = unitTypes.map((u) => {
    const counts = {};
    for (const [idx, n] of Object.entries(u.counts)) {
      const l = levels[Number(idx)];
      if (l) counts[l.id] = n;
    }
    const ids = Object.keys(counts);
    const allTownhome = ids.length > 0 && ids.every((id) => townhomeLevelIds.has(id));
    return { id: newId('ut'), ...u, kind: allTownhome ? 'townhome' : u.kind, counts };
  });

  return { buildings, levels, rooms, unitTypes: types };
}
