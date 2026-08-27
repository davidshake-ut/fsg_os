import { MUZE } from './muze';

// Rebuilds what David gets when he copies the Muze "Unit Matrix" tab out
// of Excel and pastes it: two stacked header rows (merged captions land in
// the first cell of their span), cells with embedded newlines quoted, unit
// rows interleaved with section titles and subtotal rows, and the
// per-building / per-level / total columns off to the right that the
// importer must ignore.

const levelCaption = (l) => {
  if (l.id === 'th') return 'TOWNHOMES';
  const lv = l.level === 'BSMT' ? 'BSMT' : `LVL ${l.level.slice(1)}`;
  return `BLDG\n ${l.building}-${lv}`;
};

const tsvCell = (v) => {
  const s = String(v ?? '');
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function muzeUnitSchedulePaste() {
  const levels = MUZE.levels;
  const blanks = (n) => Array.from({ length: n }, () => '');
  const rows = [];

  rows.push([
    'UNIT TYPE', 'UNIT DESCRIPTION', 'UNIT\n BED\n COUNT', 'RENTABLE SQUARE FOOTAGE', '', '',
    'UNITS PER BUILDING LEVEL', ...blanks(levels.length - 1),
    'UNITS PER BUILDING', '', '', '',
    'UNITS PER LEVEL', '', '', '', '',
    'TOTAL\n UNITS', 'TOTAL\n BEDS', 'UNIT TYPE', 'UNITS W/\n PRIVATE\n YARDS',
  ]);
  rows.push([
    '', '', '', 'NET\n RENTABLE', 'BALCONY', 'INCL.\n BALCONY',
    ...levels.map(levelCaption),
    'BLDG 1', 'BLDG 2', 'BLDG 3', 'BLDG 4',
    'BSMNT', '1.0', '2.0', '3.0', '4.0',
    '', '', '', '',
  ]);

  const sections = [
    ['1 BEDROOM UNITS', (u) => u.kind === 'apartment' && u.bedrooms === 1],
    ['2 BEDROOM UNITS', (u) => u.kind === 'apartment' && u.bedrooms === 2],
    ['3 BEDROOM UNITS', (u) => u.kind === 'apartment' && u.bedrooms === 3],
    ['Townhomes', (u) => u.kind === 'townhome'],
  ];
  const fmt = (n) => `${n}.0`;

  for (const [title, pick] of sections) {
    rows.push([title]);
    const group = MUZE.unitTypes.filter(pick);
    for (const u of group) {
      const counts = levels.map((l) => u.countsByLevel[l.id] ?? 0);
      const total = counts.reduce((s, n) => s + n, 0);
      const perBuilding = [1, 2, 3, 4].map((b) =>
        levels.reduce((s, l, i) => s + (l.building === b ? counts[i] : 0), 0)
      );
      const perLevel = ['BSMT', 'L1', 'L2', 'L3', 'L4'].map((lv) =>
        levels.reduce((s, l, i) => s + (l.level === lv ? counts[i] : 0), 0)
      );
      rows.push([
        u.code, u.description, fmt(u.bedrooms),
        `${u.sqft.toLocaleString('en-US')} SF`, `${u.balconySqft ?? 0} SF`, `${(u.sqft + (u.balconySqft ?? 0)).toLocaleString('en-US')} SF`,
        ...counts.map(fmt),
        ...perBuilding.map(fmt),
        ...perLevel.map(fmt),
        fmt(total), fmt(total * u.bedrooms), u.code, '0.0',
      ]);
    }
    // Subtotal row: no code, no bedroom count — must be skipped.
    const sub = levels.map((l) => group.reduce((s, u) => s + (u.countsByLevel[l.id] ?? 0), 0));
    rows.push(['', '', '', '', '', `${sub.reduce((s, n) => s + n, 0)} SF`, ...sub.map(fmt)]);
  }
  rows.push(['TOTAL', '', '', '', '', '47,075 SF', ...levels.map((l) => fmt(MUZE.takeoff.unitsByLevel[l.id]))]);

  return rows.map((r) => r.map(tsvCell).join('\t')).join('\r\n');
}
