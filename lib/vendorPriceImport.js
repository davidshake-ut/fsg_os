import { parseCSV } from './csv';

// Parses a vendor's raw price list (e.g. a distributor/manufacturer price
// book) into { sku, price, productLine, description } rows. Deliberately
// looser than parseCatalogCSV — only SKU and Price are required, since a
// vendor sheet won't know our internal Category taxonomy. Product Line is
// read from the file when present; callers fall back to whatever product_line
// is already assigned to that SKU in the catalog when the column is absent.
export function parseVendorPriceList(text) {
  const allRows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (allRows.length === 0) return { rows: [], errors: ['File is empty.'] };

  const header = allRows[0].map((h) => h.trim().toLowerCase());
  const idx = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iSku = idx(['sku', 'part number', 'part no', 'part #', 'model', 'model number']);
  const iPrice = idx(['price', 'list price', 'msrp', 'unit price', 'list']);
  const iLine = idx(['product line', 'product family', 'family', 'line']);
  const iDesc = idx(['description', 'desc', 'product description', 'name']);

  const errors = [];
  if (iSku === -1) errors.push('Missing a "SKU" / "Part Number" column.');
  if (iPrice === -1) errors.push('Missing a "Price" / "List Price" column.');
  if (errors.length) return { rows: [], errors };

  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const rows = [];
  for (let r = 1; r < allRows.length; r++) {
    const cells = allRows[r];
    const sku = (cells[iSku] || '').trim();
    if (!sku) continue; // skip section/blank rows
    const price = num(cells[iPrice]);
    if (!Number.isFinite(price)) {
      errors.push(`Row ${r + 1} (${sku}): invalid/blank price — skipped.`);
      continue;
    }
    rows.push({
      sku,
      price,
      productLine: iLine !== -1 ? (cells[iLine] || '').trim() : '',
      description: iDesc !== -1 ? (cells[iDesc] || '').trim() : '',
    });
  }
  return { rows, errors };
}

// Matches parsed vendor rows against the current catalog by SKU (case/space
// insensitive). Rows whose SKU isn't already in the catalog are excluded —
// this importer only ever updates existing products, never adds new ones.
export function matchVendorRows(vendorRows, allProducts) {
  const bySku = new Map(allProducts.map((p) => [p.sku.trim().toLowerCase(), p]));
  const matched = [];
  const unmatched = [];
  for (const row of vendorRows) {
    const existing = bySku.get(row.sku.trim().toLowerCase());
    if (existing) matched.push({ vendorRow: row, existing });
    else unmatched.push(row);
  }
  return { matched, unmatched };
}
