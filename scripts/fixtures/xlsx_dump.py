"""Dump an .xlsx (values + formulas) using only the stdlib.

usage: python xlsx_dump.py FILE                 -> workbook summary
       python xlsx_dump.py FILE "Sheet name"    -> every non-empty cell, row by row
       python xlsx_dump.py FILE "Sheet name" N  -> first N rows only
"""
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'m': M, 'r': R}


def load(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    relmap = {r.get('Id'): r.get('Target') for r in rels.findall('{%s}Relationship' % P)}
    sheets = []
    for s in wb.findall('m:sheets/m:sheet', NS):
        target = relmap[s.get('{%s}id' % R)]
        target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        sheets.append((s.get('name'), target, s.get('state')))
    names = []
    for dn in wb.findall('m:definedNames/m:definedName', NS):
        names.append((dn.get('name'), dn.text))
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in ss.findall('m:si', NS):
            strings.append(''.join(t.text or '' for t in si.iter('{%s}t' % M)))
    return z, sheets, names, strings


def cells(z, target, strings):
    root = ET.fromstring(z.read(target))
    dim = root.find('m:dimension', NS)
    merges = [mc.get('ref') for mc in root.findall('m:mergeCells/m:mergeCell', NS)]
    shared = {}
    out = []
    for c in root.iter('{%s}c' % M):
        ref = c.get('r')
        t = c.get('t')
        f = c.find('m:f', NS)
        v = c.find('m:v', NS)
        formula = None
        if f is not None:
            if f.get('t') == 'shared':
                si = f.get('si')
                if f.text:
                    shared[si] = (ref, f.text)
                    formula = f.text
                else:
                    master = shared.get(si)
                    formula = '<shared from %s: %s>' % master if master else '<shared %s>' % si
            else:
                formula = f.text
        val = None
        if v is not None and v.text is not None:
            val = v.text
            if t == 's':
                val = strings[int(val)]
            elif t == 'b':
                val = 'TRUE' if val == '1' else 'FALSE'
            elif t == 'e':
                val = '#ERR:' + val
        elif t == 'inlineStr':
            is_ = c.find('m:is', NS)
            if is_ is not None:
                val = ''.join(x.text or '' for x in is_.iter('{%s}t' % M))
        if val is None and formula is None:
            continue
        out.append((ref, val, formula))
    return (dim.get('ref') if dim is not None else '?'), merges, out


def col_row(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref)
    return m.group(1), int(m.group(2))


def main():
    path = sys.argv[1]
    want = sys.argv[2] if len(sys.argv) > 2 else None
    maxrows = int(sys.argv[3]) if len(sys.argv) > 3 else 10 ** 9
    z, sheets, names, strings = load(path)
    if want is None:
        for name, target, state in sheets:
            dim, merges, cs = cells(z, target, strings)
            nf = sum(1 for _, _, f in cs if f)
            extra = (' state=' + state) if state else ''
            print(f'{name!r:42} {target:26} dim={dim:14} cells={len(cs):5} formulas={nf:5} merged={len(merges)}{extra}')
        if names:
            print('--- defined names ---')
            for n, ref in names:
                print(f'  {n} = {ref}')
        return
    for name, target, state in sheets:
        if name != want:
            continue
        dim, merges, cs = cells(z, target, strings)
        print(f'### {name} dim={dim} merged={len(merges)}')
        rows = {}
        for ref, val, f in cs:
            col, row = col_row(ref)
            rows.setdefault(row, []).append((col, ref, val, f))
        for row in sorted(rows):
            if row > maxrows:
                break
            parts = []
            for col, ref, val, f in sorted(rows[row], key=lambda x: (len(x[0]), x[0])):
                s = f'{ref}={val!r}' if val is not None else ref
                if f:
                    s += f' [={f}]'
                parts.append(s)
            print(f'r{row}: ' + ' | '.join(parts))
        return
    print('sheet not found:', want)
    print('available:', [s[0] for s in sheets])


if __name__ == '__main__':
    main()
