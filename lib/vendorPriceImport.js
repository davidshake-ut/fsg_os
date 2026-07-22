import { parseCSV } from './csv';
import { costFromDiscount } from './pricing';

// The fields the importer consumes, with the header aliases used to
// auto-guess which CSV column holds each one. The guess is only a starting
// point — the import modal lets the user remap any field to any column, so
// a price book never has to be renamed to match these.
export const VENDOR_IMPORT_FIELDS = [
  { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'part number', 'part no', 'part #', 'model', 'model number'] },
  { key: 'price', label: 'Price', required: true, aliases: ['price', 'list price', 'msrp', 'unit price', 'list'] },
  { key: 'cost', label: 'Cost', required: false, aliases: ['cost', 'net price', 'net', 'dealer price', 'dealer cost', 'your price', 'your cost', 'unit cost'] },
  { key: 'discount', label: 'Discount %', required: false, aliases: ['discount', 'discount %', 'disc', 'disc %', 'partner discount', 'discount percent'] },
  { key: 'productLine', label: 'Product Line', required: false, aliases: ['product line', 'product family', 'family', 'line'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'product description', 'name'] },
];

function guessMapping(headerLower) {
  const idx = (names) => {
    for (const n of names) {
      const i = headerLower.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const mapping = {};
  for (const f of VENDOR_IMPORT_FIELDS) mapping[f.key] = idx(f.aliases);
  return mapping;
}

// First pass over an uploaded price list: header (original casing), a few
// sample data rows for the mapping UI's previews, and the auto-guessed
// column mapping. Never errors on unrecognized columns — that's what the
// mapping step is for; only a file with no rows at all is unusable.
export function readVendorPriceFile(text) {
  const allRows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (allRows.length === 0) return { error: 'File is empty.', header: [], sampleRows: [], guess: null };
  const header = allRows[0].map((h) => String(h).trim());
  return {
    error: null,
    header,
    sampleRows: allRows.slice(1, 4),
    guess: guessMapping(header.map((h) => h.toLowerCase())),
  };
}

// Parses a vendor's raw price list (e.g. a distributor/manufacturer price
// book) into { sku, price, productLine, description } rows. Deliberately
// looser than parseCatalogCSV — only SKU and Price are required, since a
// vendor sheet won't know our internal Category taxonomy. Product Line is
// read from the file when present; callers fall back to whatever product_line
// is already assigned to that SKU in the catalog when the column is absent.
// `mapping` ({ sku, price, productLine, description } → column index, -1 for
// "not in this file") overrides the header auto-guess when provided.
export function parseVendorPriceList(text, mapping = null) {
  const allRows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (allRows.length === 0) return { rows: [], errors: ['File is empty.'] };

  const header = allRows[0].map((h) => String(h).trim().toLowerCase());
  const m = mapping ?? guessMapping(header);
  const iSku = m.sku ?? -1;
  const iPrice = m.price ?? -1;
  const iCost = m.cost ?? -1;
  const iDisc = m.discount ?? -1;
  const iLine = m.productLine ?? -1;
  const iDesc = m.description ?? -1;

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
    // Cost and Discount are best-effort per row: a blank or unparseable cell
    // is null (fall through to the next cost source), never a row error.
    const optNum = (i) => {
      if (i === -1) return null;
      const raw = String(cells[i] ?? '').trim();
      if (!raw) return null;
      const n = num(raw);
      return Number.isFinite(n) ? n : null;
    };
    rows.push({
      sku,
      price,
      cost: optNum(iCost),
      discount: optNum(iDisc),
      productLine: iLine !== -1 ? (cells[iLine] || '').trim() : '',
      description: iDesc !== -1 ? (cells[iDesc] || '').trim() : '',
    });
  }
  return { rows, errors };
}

// Cost precedence for an imported row: explicit Cost column → Discount %
// column applied to Price → the catalog's Product Line discount → fallback
// (the existing cost for updates, 0 for brand-new products). Returns
// { cost, fromFile } — fromFile means the file itself dictated the cost, so
// reassigning a Product Line in the review step must not recompute it.
export function resolveImportCost(row, { productLine = '', productLineDiscounts = {}, fallback = 0 } = {}) {
  if (Number.isFinite(row.cost)) return { cost: row.cost, fromFile: true };
  if (Number.isFinite(row.discount)) return { cost: costFromDiscount(row.price, row.discount), fromFile: true };
  if (productLine && productLine in productLineDiscounts) {
    return { cost: costFromDiscount(row.price, productLineDiscounts[productLine]), fromFile: false };
  }
  return { cost: fallback, fromFile: false };
}

// Matches parsed vendor rows against the current catalog by SKU (case/space
// insensitive). Rows whose SKU isn't already in the catalog are excluded —
// this importer only ever updates existing products, never adds new ones.
export function matchVendorRows(vendorRows, allProducts) {
  // Index by both the displayed sku and the identity (baseSku) so vendor
  // sheets match aliased products (0065) either way.
  const bySku = new Map();
  for (const p of allProducts) {
    bySku.set(p.sku.trim().toLowerCase(), p);
    if (p.baseSku && p.baseSku !== p.sku) bySku.set(p.baseSku.trim().toLowerCase(), p);
  }
  const matched = [];
  const unmatched = [];
  for (const row of vendorRows) {
    const existing = bySku.get(row.sku.trim().toLowerCase());
    if (existing) matched.push({ vendorRow: row, existing });
    else unmatched.push(row);
  }
  return { matched, unmatched };
}
