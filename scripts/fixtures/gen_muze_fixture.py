"""Generate __tests__/fixtures/muze.js from the Muze Apartments workbook.

    python scripts/fixtures/gen_muze_fixture.py "<path to Muze Apartments 081826.xlsx>"

Reads cached cell VALUES (what Excel last computed) with the stdlib only
(see xlsx_dump.py beside this file) and emits one JS object: the property
takeoff, coverage rules, per-IDF switch plan, rack kits, every option tab's
hardware / labor / wiring rows, and the workbook's own totals as parity
targets. Regenerate rather than hand-edit the fixture; the parity test
(__tests__/muzeParity.test.js) proves the output reproduces every total.
"""
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from xlsx_dump import load, cells, col_row  # noqa: E402

DEFAULT_XLSX = r"C:\Users\david\OneDrive\Documents\Fusion Concepts Stuff\FSG Stuff\Client Stuff\SKBM\Projects\Muze Apartments\Muze Apartments 081826.xlsx"
XLSX = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '__tests__', 'fixtures', 'muze.js'))

z, sheets, names, strings = load(XLSX)


def grid(name):
    for n, target, _state in sheets:
        if n == name:
            _dim, _merges, cs = cells(z, target, strings)
            return {ref: val for ref, val, _f in cs}
    raise KeyError(name)


def num(v):
    if v is None:
        return None
    try:
        f = float(str(v).replace(',', ''))
    except ValueError:
        return None
    return int(f) if f == int(f) else round(f, 6)


def sqft(v):
    m = re.search(r'([\d,]+)\s*SF', str(v or ''))
    return int(m.group(1).replace(',', '')) if m else None


def text(v):
    return str(v).strip() if v is not None else ''


LEVELS = [
    ('G', 'b1-bsmt', 1, 'BSMT'), ('H', 'b1-l1', 1, 'L1'), ('I', 'b1-l2', 1, 'L2'), ('J', 'b1-l3', 1, 'L3'), ('K', 'b1-l4', 1, 'L4'),
    ('L', 'b2-bsmt', 2, 'BSMT'), ('M', 'b2-l1', 2, 'L1'), ('N', 'b2-l2', 2, 'L2'), ('O', 'b2-l3', 2, 'L3'), ('P', 'b2-l4', 2, 'L4'),
    ('Q', 'b3-bsmt', 3, 'BSMT'), ('R', 'b3-l1', 3, 'L1'), ('S', 'b3-l2', 3, 'L2'), ('T', 'b3-l3', 3, 'L3'), ('U', 'b3-l4', 3, 'L4'),
    ('V', 'b4-l1', 4, 'L1'), ('W', 'b4-l2', 4, 'L2'), ('X', 'b4-l3', 4, 'L3'), ('Y', 'b4-l4', 4, 'L4'),
    ('Z', 'th', 'TH', 'TH'),
]

# ---------------------------------------------------------------- unit grid
um = grid('Unit Matrix')
unit_types = []
for r in range(4, 59):
    code = text(um.get(f'A{r}'))
    beds = num(um.get(f'C{r}'))
    if not code or beds is None:
        continue
    counts = {}
    for col, lid, _b, _l in LEVELS:
        n = num(um.get(f'{col}{r}')) or 0
        if n:
            counts[lid] = n
    unit_types.append({
        'code': code,
        'description': text(um.get(f'B{r}')),
        'bedrooms': beds,
        'kind': 'townhome' if code.upper().startswith('TH') else 'apartment',
        'sqft': sqft(um.get(f'D{r}')),
        'balconySqft': sqft(um.get(f'E{r}')),
        'countsByLevel': counts,
    })

# ---------------------------------------------------------------- takeoff
et = grid('Equipment Takeoff')


def row_by_level(r):
    return {lid: (num(et.get(f'{col}{r}')) or 0) for col, lid, _b, _l in LEVELS}


takeoff = {
    'unitsByLevel': row_by_level(60),
    'totalUnits': num(et.get('AJ60')),
    'totalBeds': num(et.get('AK60')),
    'coverage': {
        'baseline': {'label': text(et.get('B62')), 'apsPerUnit': {'1': num(et.get('B64')), '2': num(et.get('B65')), '3': num(et.get('B66')), 'th': num(et.get('B67'))},
                     'apsByLevel': row_by_level(68), 'totalAPs': num(et.get('AA68')), 'portsByLevel': row_by_level(69)},
        'extended': {'label': text(et.get('B77')), 'apsPerUnit': {'1': num(et.get('B79')), '2': num(et.get('B80')), '3': num(et.get('B81')), 'th': num(et.get('B82'))},
                     'apsByLevel': row_by_level(83), 'totalAPs': num(et.get('AA83')), 'portsByLevel': row_by_level(84)},
    },
    'portOverheadFactor': 1.2,
    'switchPlan': {lid: {'s8': num(et.get(f'{col}87')) or 0, 's24': num(et.get(f'{col}88')) or 0, 's48': num(et.get(f'{col}89')) or 0}
                   for col, lid, _b, _l in LEVELS},
    'unlabeledRow90': {lid: (num(et.get(f'{col}90')) or 0) for col, lid, _b, _l in LEVELS if col != 'Z'},
    'switchTotals': {'s8': num(et.get('AA87')), 's24': num(et.get('AA88')), 's48': num(et.get('AA89')), 'ports': num(et.get('AB90'))},
    'poeNotes': [text(et.get('A93')), text(et.get('A94')), text(et.get('A96'))],
    'amenityLocations': [text(et.get(f'A{r}')) for r in range(104, 118) if text(et.get(f'A{r}'))],
    'amenityAPs': num(et.get('C103')),
    'outdoorLocations': [text(et.get(f'A{r}')) for r in range(120, 125) if text(et.get(f'A{r}'))],
    'outdoorAPs': num(et.get('C119')),
    'otherDrops': [text(et.get(f'A{r}')) for r in range(127, 132) if text(et.get(f'A{r}'))],
    'otherDropsIncluded': num(et.get('C126')),
    'exclusions': [text(et.get(f'A{r}')) for r in range(135, 137) if text(et.get(f'A{r}'))],
}

# ---------------------------------------------------------------- rack kits
rk = grid('MDF  IDF Racks')


def kit(key, label, first, last, subtotal_ref):
    comps = []
    for r in range(first, last + 1):
        sku = text(rk.get(f'D{r}'))
        if not sku and not text(rk.get(f'E{r}')):
            continue
        comps.append({
            'category': text(rk.get(f'B{r}')),
            'manufacturer': text(rk.get(f'C{r}')),
            'sku': sku,
            'description': text(rk.get(f'E{r}'))[:90],
            'qty': num(rk.get(f'F{r}')) or 0,
            'unitPrice': num(rk.get(f'H{r}')) or 0,
        })
    return {'key': key, 'label': label, 'components': comps, 'expectedCost': num(rk.get(subtotal_ref))}


kits = [
    kit('idf-12u', text(rk.get('A1')), 3, 15, 'I17'),
    kit('idf-12u-fttu', text(rk.get('A19')), 21, 27, 'I29'),
    kit('mdf-22u', text(rk.get('A31')), 33, 45, 'I47'),
    kit('mdf-22u-fttu', text(rk.get('A49')), 51, 63, 'I65'),
    kit('media-panel', text(rk.get('A71')), 73, 83, 'I85'),
]
kits[-1]['expectedCostWithoutFiber'] = num(rk.get('I86'))

# ---------------------------------------------------------------- option tabs


def find_row(g, col, value, start=1, end=120):
    for r in range(start, end):
        if text(g.get(f'{col}{r}')) == value:
            return r
    return None


def parse_hw(g, hdr, cols, vendor):
    rows = []
    r = hdr + 1
    misc = None
    while r < hdr + 60:
        a = text(g.get(f'A{r}'))
        if a == 'TOTALS':
            break
        if a:
            if a.upper().startswith('MISC'):
                misc = {'pct': num(g.get(f'B{r}')), 'markup': num(g.get(f'{cols["markup"]}{r}'))}
            else:
                rows.append({
                    'role': a,
                    'qty': num(g.get(f'B{r}')) or 0,
                    'sku': text(g.get(f'{cols["sku"]}{r}')),
                    'eaCost': num(g.get(f'{cols["cost"]}{r}')) or 0,
                    'eaPrice': num(g.get(f'{cols["price"]}{r}')),
                    'markup': num(g.get(f'{cols["markup"]}{r}')) or 0,
                    'license5yr': num(g.get(f'{cols["lic"]}{r}')),
                })
        r += 1
    totals_row = r
    return {
        'vendor': vendor,
        'rows': rows,
        'misc': misc,
        'expected': {'cost': num(g.get(f'{cols["ext"]}{totals_row}')), 'price': num(g.get(f'{cols["cust"]}{totals_row}'))},
    }


def parse_labor(g):
    hdr = None
    for r in range(1, 80):
        if text(g.get(f'A{r}')) == 'EQUPMENT TYPE' and text(g.get(f'C{r}')) == '# HOURS':
            hdr = r
            break
    rows = []
    r = hdr + 1
    while text(g.get(f'A{r}')) != 'TOTALS':
        a = text(g.get(f'A{r}'))
        if a:
            rows.append({'task': a, 'qty': num(g.get(f'B{r}')) or 0, 'hours': num(g.get(f'C{r}')) or 0,
                         'costRate': num(g.get(f'D{r}')) or 0, 'billRate': num(g.get(f'E{r}')) or 0})
        r += 1
    return {'rows': rows, 'expected': {'cost': num(g.get(f'F{r}')), 'price': num(g.get(f'G{r}'))}}


def parse_wiring(g):
    hdr = find_row(g, 'A', 'RUN TYPE')
    rows = []
    r = hdr + 1
    while text(g.get(f'A{r}')) != 'TOTALS':
        a = text(g.get(f'A{r}'))
        if a:
            rows.append({'run': a, 'qty': num(g.get(f'B{r}')) or 0, 'dropCost': num(g.get(f'C{r}')) or 0,
                         'dropPrice': num(g.get(f'D{r}')) or 0, 'sowRef': text(g.get(f'G{r}'))})
        r += 1
    return {'rows': rows, 'expected': {'cost': num(g.get(f'E{r}')), 'price': num(g.get(f'F{r}'))}}


def parse_summaries(g):
    out = []
    for r in range(1, 120):
        if text(g.get(f'A{r}')) == 'SUMMARY':
            name = text(g.get(f'A{r + 1}'))
            tr = r + 5
            if text(g.get(f'A{tr}')) == 'TOTAL':
                out.append({'name': name, 'cost': num(g.get(f'B{tr}')), 'price': num(g.get(f'C{tr}')),
                            'grossProfit': num(g.get(f'D{tr}')), 'margin': num(g.get(f'E{tr}'))})
    return out


def parse_option(name, key):
    g = grid(name)
    hdr = 3
    blocks = []
    v1 = text(g.get('C2')) or text(g.get('D2'))
    blocks.append(parse_hw(g, hdr, {'sku': 'C', 'cost': 'D', 'price': 'E', 'markup': 'H', 'lic': 'L', 'ext': 'F', 'cust': 'I'}, v1.title()))
    if text(g.get('M3')) == 'SKU':
        blocks.append(parse_hw(g, hdr, {'sku': 'M', 'cost': 'N', 'price': 'O', 'markup': 'R', 'lic': 'V', 'ext': 'P', 'cust': 'S'}, text(g.get('M2')).title()))
    return {
        'key': key,
        'sheet': name,
        'title': text(g.get('A2')),
        'hardware': blocks,
        'labor': parse_labor(g),
        'wiring': parse_wiring(g),
        'summaries': parse_summaries(g),
    }


options = [
    parse_option('OPT 1 WIFI 6 BASELINE', 'opt1'),
    parse_option('OPT 2 WIFI 6 EXT COVERAGE', 'opt2'),
    parse_option('OPT 3 WIFI 7 w RG NETS', 'opt3'),
    parse_option('OPT 4 FTTU', 'opt4'),
]

# ---------------------------------------------------------------- comparison matrix
cm = grid('COMPARISON MATRIX')
cols = ['B', 'C', 'D', 'E', 'F']
comparison = {'units': 400, 'termMonths': 60, 'columns': []}
for c in cols:
    comparison['columns'].append({
        'label': text(cm.get(f'{c}3')),
        'hardwareCost': num(cm.get(f'{c}4')), 'hardwarePrice': num(cm.get(f'{c}5')),
        'laborCost': num(cm.get(f'{c}7')), 'laborPrice': num(cm.get(f'{c}8')),
        'managedWifiPrice': num(cm.get(f'{c}10')), 'perUnitPerMonth': num(cm.get(f'{c}11')),
        'cablingCost': num(cm.get(f'{c}13')), 'cablingPrice': num(cm.get(f'{c}14')),
        'totalCost': num(cm.get(f'{c}16')), 'totalPrice': num(cm.get(f'{c}17')),
        'markup': num(cm.get(f'{c}19')), 'margin': num(cm.get(f'{c}20')),
        'mrc': {'segra5g': num(cm.get(f'{c}25')), 'frontier5g': num(cm.get(f'{c}28')),
                'supportFeeCost': num(cm.get(f'{c}31')), 'supportFeePrice': num(cm.get(f'{c}32')), 'rxgMonthly': num(cm.get(f'{c}34'))},
        'financing': {'monthly60': num(cm.get(f'{c}40')), 'monthly36': num(cm.get(f'{c}41')), 'upliftNeeded': num(cm.get(f'{c}43'))},
    })
comparison['supportFeePerUnitPerMonth'] = 4.75
comparison['financingDiscountPct'] = 12

fixture = {
    'source': 'Muze Apartments 081826.xlsx',
    'generated': date.today().isoformat(),
    'levels': [{'id': lid, 'building': b, 'level': lv} for _c, lid, b, lv in LEVELS],
    'unitTypes': unit_types,
    'takeoff': takeoff,
    'kits': kits,
    'options': options,
    'comparison': comparison,
}

js = (
    '// GENERATED from "Muze Apartments 081826.xlsx" by scripts/fixtures/gen_muze_fixture.py (%s).\n'
    '// Golden fixture for the complex-project Builder initiative — Phase 0.\n'
    '// Numbers are the workbook\'s own cached values; regenerate rather than hand-edit.\n'
    '// See C:\\Users\\david\\.claude\\plans\\muze-to-builder.md for what each block means.\n'
    'export const MUZE = %s;\n'
) % (date.today().isoformat(), json.dumps(fixture, indent=2, ensure_ascii=False))
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(js)

print('unit types:', len(unit_types), ' units:', sum(sum(u['countsByLevel'].values()) for u in unit_types),
      ' beds:', sum(u['bedrooms'] * sum(u['countsByLevel'].values()) for u in unit_types))
for o in options:
    print(o['key'], '| hw blocks:', [(b['vendor'], len(b['rows']), b['misc'], b['expected']) for b in o['hardware']])
    print('     labor rows', len(o['labor']['rows']), o['labor']['expected'], '| wiring rows', len(o['wiring']['rows']), o['wiring']['expected'])
    print('     summaries', o['summaries'])
for k in kits:
    print(k['key'], len(k['components']), 'components; expected', k['expectedCost'])
print('bytes:', len(js))
