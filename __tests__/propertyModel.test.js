import { describe, it, expect } from 'vitest';
import { PON_DEFAULTS } from '../lib/ponModel';
import { parseCSV, parseDelimited } from '../lib/csv';
import {
  KIT_DEFAULTS,
  normalizePropertyModel,
  unitClassOf,
  unitClassLabel,
  sortUnitClasses,
  orderedLevels,
  propertyTotals,
  ensureRoomPerLevel,
  shortBuildingName,
  parseLevelHeader,
  columnHeaders,
  toNumber,
  guessUnitScheduleMapping,
  parseUnitSchedule,
  propertyFromImport,
} from '../lib/propertyModel';
import { muzeUnitSchedulePaste } from './fixtures/muzePaste';
import { MUZE } from './fixtures/muze';

const small = () => ({
  buildings: [{ id: 'b1', name: 'Building 1' }, { id: 'b2', name: 'Building 2' }],
  levels: [
    { id: 'l1', buildingId: 'b1', name: 'Level 1', roomId: 'r1' },
    { id: 'l2', buildingId: 'b1', name: 'Level 2', roomId: 'r1' },
    { id: 'l3', buildingId: 'b2', name: 'Level 1', roomId: 'r2' },
  ],
  rooms: [{ id: 'r1', name: 'B1 MDF', isMdf: true }, { id: 'r2', name: 'B2 IDF', isMdf: false }],
  unitTypes: [
    { id: 'u1', code: 'A1', description: '1 BR', bedrooms: 1, kind: 'apartment', sqft: 600, counts: { l1: 4, l2: 4 } },
    { id: 'u2', code: 'B1', description: '2 BR', bedrooms: 2, kind: 'apartment', sqft: 900, counts: { l3: 3 } },
    { id: 'u3', code: 'TH1', description: 'Townhome', bedrooms: 3, kind: 'townhome', sqft: 1500, counts: { l3: 2 } },
  ],
  amenityLocations: [{ id: 'a1', name: 'Lounge', qty: 2 }],
  outdoorLocations: [],
  otherDrops: [{ id: 'd1', name: 'Elevators', qty: 5, included: false }],
  notes: 'no garage APs',
});

describe('normalizePropertyModel', () => {
  it('fills defaults and coerces numbers', () => {
    const m = normalizePropertyModel(undefined);
    expect(m).toEqual({ buildings: [], levels: [], rooms: [], unitTypes: [], amenityLocations: [], outdoorLocations: [], otherDrops: [], notes: '', kits: KIT_DEFAULTS, cabling: { enabled: true, runs: {} }, architecture: 'active_ethernet', pon: PON_DEFAULTS });
    // Kit choices: unknown rooms drop out of the per-room map, hours coerce.
    const k = normalizePropertyModel({ rooms: [{ id: 'r1', name: 'A' }], kits: { idfSku: ' KIT-X ', roomKitSku: { r1: 'none', ghost: 'KIT-Y' }, installHours: { idf: '4' } } });
    expect(k.kits).toEqual({ ...KIT_DEFAULTS, idfSku: 'KIT-X', roomKitSku: { r1: 'none' }, installHours: { mdf: 16, idf: 4, mediaPanel: 1 } });
    const n = normalizePropertyModel({
      buildings: [{ id: 'b1', name: '  B ' }],
      levels: [{ id: 'l1', buildingId: 'b1', name: '', roomId: 'ghost' }],
      unitTypes: [{ id: 'u1', code: 'A', bedrooms: '2', sqft: '-5', kind: 'weird', counts: { l1: '3', gone: 9, l2: 0 } }],
    });
    expect(n.buildings[0].name).toBe('B');
    expect(n.levels[0]).toEqual({ id: 'l1', buildingId: 'b1', name: 'Level', roomId: null });
    expect(n.unitTypes[0]).toMatchObject({ bedrooms: 2, sqft: 0, kind: 'apartment', counts: { l1: 3 } });
  });

  it('drops levels whose building is gone and counts for levels that are gone', () => {
    const m = normalizePropertyModel({ ...small(), buildings: [{ id: 'b1', name: 'Building 1' }] });
    expect(m.levels.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(m.unitTypes.find((u) => u.id === 'u2').counts).toEqual({});
  });
});

describe('unit classes and totals', () => {
  it('classes key on bedrooms, townhomes are their own class', () => {
    expect(unitClassOf({ bedrooms: 2, kind: 'apartment' })).toBe('2');
    expect(unitClassOf({ bedrooms: 0, kind: 'apartment' })).toBe('0');
    expect(unitClassOf({ bedrooms: 3, kind: 'townhome' })).toBe('th');
    expect(unitClassLabel('0')).toBe('Studio');
    expect(unitClassLabel('th')).toBe('Townhome');
    expect(sortUnitClasses(['th', '2', '0', '1'])).toEqual(['0', '1', '2', 'th']);
  });

  it('propertyTotals rolls up by level, building, class, and room', () => {
    const t = propertyTotals(normalizePropertyModel(small()));
    expect(t.units).toBe(13);
    expect(t.beds).toBe(4 + 4 + 6 + 6);
    expect(t.sqft).toBe(8 * 600 + 3 * 900 + 2 * 1500);
    expect(t.byLevel.l1).toEqual({ units: 4, beds: 4, byClass: { 1: 4 } });
    expect(t.byLevel.l3).toEqual({ units: 5, beds: 12, byClass: { 2: 3, th: 2 } });
    expect(t.byBuilding).toEqual({ b1: { units: 8, beds: 8 }, b2: { units: 5, beds: 12 } });
    expect(t.byClass).toEqual({ 1: 8, 2: 3, th: 2 });
    expect(t.byRoom).toEqual({ r1: { units: 8, levelIds: ['l1', 'l2'] }, r2: { units: 5, levelIds: ['l3'] } });
    expect(t).toMatchObject({ unitTypes: 3, buildings: 2, levels: 3, rooms: 2 });
  });

  it('orderedLevels follows building order then stored level order', () => {
    const m = normalizePropertyModel({ ...small(), buildings: [{ id: 'b2', name: 'Building 2' }, { id: 'b1', name: 'Building 1' }] });
    expect(orderedLevels(m).map((l) => l.id)).toEqual(['l3', 'l1', 'l2']);
  });

  it('ensureRoomPerLevel only creates rooms for unassigned levels and designates an MDF when none exists', () => {
    const base = normalizePropertyModel({ ...small(), rooms: [], levels: small().levels.map((l) => ({ ...l, roomId: null })) });
    const next = ensureRoomPerLevel(base);
    expect(next.rooms).toHaveLength(3);
    expect(next.rooms.filter((r) => r.isMdf)).toHaveLength(1);
    expect(next.rooms.map((r) => r.name)).toEqual(['B1 Level 1', 'B1 Level 2', 'B2 Level 1']);
    expect(next.levels.every((l) => l.roomId)).toBe(true);
    const again = ensureRoomPerLevel(next);
    expect(again.rooms).toHaveLength(3);
  });

  it('shortBuildingName abbreviates', () => {
    expect(shortBuildingName('Building 1')).toBe('B1');
    expect(shortBuildingName('Bldg C')).toBe('BC');
    expect(shortBuildingName('Townhomes')).toBe('TH');
    expect(shortBuildingName('Clubhouse')).toBe('CLU');
  });
});

describe('level captions', () => {
  it.each([
    ['BLDG\n 1-LVL 1', { building: 'Building 1', level: 'Level 1', townhome: false }],
    ['UNITS PER BUILDING LEVEL BLDG 1-BSMT', { building: 'Building 1', level: 'Basement', townhome: false }],
    ['Building B - Floor 2', { building: 'Building B', level: 'Level 2', townhome: false }],
    ['TOWNHOMES', { building: 'Townhomes', level: 'Townhomes', townhome: true }],
    ['Level 3', { building: null, level: 'Level 3', townhome: false }],
    ['4', { building: null, level: 'Level 4', townhome: false }],
    ['Garage', { building: null, level: 'Basement', townhome: false }],
    ['Bldg 2 · Mezzanine', { building: 'Building 2', level: 'Mezzanine', townhome: false }],
  ])('%j', (header, expected) => {
    expect(parseLevelHeader(header)).toMatchObject({ ...expected, explicit: true });
  });

  it('a building name alone is a per-building total, not a level', () => {
    expect(parseLevelHeader('BLDG 2')).toMatchObject({ building: 'Building 2', explicit: false });
    expect(parseLevelHeader('UNITS PER BUILDING BLDG 1')).toMatchObject({ explicit: false });
  });
});

describe('delimited text', () => {
  it('parseCSV takes a delimiter and parseDelimited picks tabs when present', () => {
    expect(parseCSV('a\tb,c\t"d\ne"', '\t')).toEqual([['a', 'b,c', 'd\ne']]);
    expect(parseDelimited('a\tb\r\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseDelimited('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('toNumber strips units and separators', () => {
    expect(toNumber('1,571 SF')).toBe(1571);
    expect(toNumber('1.0')).toBe(1);
    expect(toNumber('$2,795.50')).toBe(2795.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber('UNIT')).toBeNull();
  });

  it('columnHeaders joins stacked header cells', () => {
    expect(columnHeaders([['A', '', 'C'], ['x', 'y', '']], 2)).toEqual(['A x', 'y', 'C']);
  });
});

describe('unit-schedule import (Muze paste)', () => {
  const rows = parseDelimited(muzeUnitSchedulePaste());
  const mapping = guessUnitScheduleMapping(rows);

  it('guesses two header rows, the identity columns, and exactly the 20 level columns', () => {
    expect(mapping.headerRows).toBe(2);
    expect(mapping.codeCol).toBe(0);
    expect(mapping.descriptionCol).toBe(1);
    expect(mapping.bedroomsCol).toBe(2);
    expect(mapping.sqftCol).toBe(3);
    expect(mapping.levelCols).toHaveLength(20);
    expect(mapping.levelCols.map((l) => l.col)).toEqual(Array.from({ length: 20 }, (_, i) => 6 + i));
    expect(mapping.levelCols[0].name).toBe('Building 1 · Basement');
    expect(mapping.levelCols[1].name).toBe('Building 1 · Level 1');
    expect(mapping.levelCols[19].name).toBe('Townhomes');
  });

  it('parses 49 unit types, skipping section titles, subtotals, and the TOTAL row', () => {
    const parsed = parseUnitSchedule(rows, mapping);
    expect(parsed.unitTypes).toHaveLength(49);
    expect(parsed.skipped).toBe(0);
    const th = parsed.unitTypes.find((u) => u.code === 'TH1');
    expect(th).toMatchObject({ kind: 'townhome', bedrooms: 3, sqft: 1648, counts: { 19: 16 } });
    const a2 = parsed.unitTypes.find((u) => u.code === 'A2');
    expect(a2.description).toBe('1 BEDROOM / 1 BATH');
    expect(Object.values(a2.counts).reduce((s, n) => s + n, 0)).toBe(33);
  });

  it('builds buildings, levels, and rooms from the captions and reproduces the Muze totals', () => {
    const model = normalizePropertyModel(propertyFromImport(parseUnitSchedule(rows, mapping)));
    expect(model.buildings.map((b) => b.name)).toEqual(['Building 1', 'Building 2', 'Building 3', 'Building 4', 'Townhomes']);
    expect(model.levels).toHaveLength(20);
    expect(model.rooms).toHaveLength(20);
    expect(model.rooms.filter((r) => r.isMdf)).toHaveLength(1);
    expect(model.levels.every((l) => l.roomId)).toBe(true);
    expect(model.rooms.map((r) => r.name).slice(0, 3)).toEqual(['B1 Basement', 'B1 Level 1', 'B1 Level 2']);
    expect(model.rooms[19].name).toBe('TH');

    const totals = propertyTotals(model);
    expect(totals.units).toBe(400);
    expect(totals.beds).toBe(598);
    expect(totals.byClass).toEqual({ 1: 240, 2: 122, 3: 22, th: 16 });
    const levels = orderedLevels(model);
    const byLevel = Object.fromEntries(levels.map((l, i) => [MUZE.levels[i].id, totals.byLevel[l.id].units]));
    expect(byLevel).toEqual(MUZE.takeoff.unitsByLevel);
    expect(totals.byBuilding[model.buildings[0].id].units).toBe(86);
  });
});
