// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes (""),
// delimiters/newlines inside quotes, BOM, and CRLF/LF line endings. The
// delimiter defaults to a comma; pass '\t' for a pasted spreadsheet range.
export function parseCSV(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/^﻿/, '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Tab-separated when the text carries tabs (an Excel / Sheets paste),
// otherwise comma-separated — same quoting rules either way.
export function parseDelimited(text) {
  const s = String(text ?? '');
  return parseCSV(s, s.includes('\t') ? '\t' : ',');
}

// Parse a catalog CSV into product rows { sku, description, category, technology?, cost, price }.
// Maps headers case-insensitively and tolerates the canonical catalog template,
// the BOM export (Unit Price), and the original vendor sheet (Our Cost/Sell Price).
//
// Category semantics: when a "Subcategory" column is present (the current
// export shape), "Category" holds the technology and "Subcategory" the part
// type. Legacy files without Subcategory keep the old meaning — Category is
// the part type, and technology is omitted (the API preserve-guard keeps the
// existing value on re-import).
//
// `technologies` (optional [{id,label}]) resolves technology labels to ids.
// Returns { products, errors }.
export function parseCatalogCSV(text, { technologies = [] } = {}) {
  const allRows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (allRows.length === 0) return { products: [], errors: ['File is empty.'] };

  const header = allRows[0].map((h) => h.trim().toLowerCase());
  const idx = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iSku = idx(['sku']);
  const iDesc = idx(['description', 'desc']);
  const iCat = idx(['category']);
  const iSub = idx(['subcategory', 'sub category', 'part type']);
  const iTech = idx(['technology']);
  const iPrice = idx(['price', 'sell price', 'unit price', 'msrp']);
  const iCost = idx(['cost', 'our cost', 'unit cost', 'dealer']);
  const iVendor = idx(['vendor', 'manufacturer', 'supplier']);
  const iPreferredVendor = idx(['source / distributor', 'source/distributor', 'source', 'preferred vendor', 'distributor']);

  const errors = [];
  if (iSku === -1) errors.push('Missing required "SKU" column.');
  if (iDesc === -1) errors.push('Missing required "Description" column.');
  if (iCat === -1 && iSub === -1) errors.push('Missing required "Category" column.');
  if (iPrice === -1) errors.push('Missing a "Price" column.');
  if (errors.length) return { products: [], errors };

  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const resolveTech = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return undefined;
    const hit = technologies.find(
      (t) => t.id.toLowerCase() === v.toLowerCase() || t.label.toLowerCase() === v.toLowerCase()
    );
    if (hit) return hit.id;
    // Accept raw registry-style ids even without a resolver list.
    if (/^[a-z0-9_]+$/.test(v)) return v;
    return undefined;
  };

  const products = [];
  for (let r = 1; r < allRows.length; r++) {
    const cells = allRows[r];
    const sku = (cells[iSku] || '').trim();
    if (!sku) continue; // skip section/blank rows (e.g. category headers)
    const description = (cells[iDesc] || '').trim();

    let category;
    let technology;
    if (iSub !== -1) {
      category = (cells[iSub] || '').trim();
      technology = resolveTech(iCat !== -1 ? cells[iCat] : undefined) ?? resolveTech(iTech !== -1 ? cells[iTech] : undefined);
    } else {
      category = (cells[iCat] || '').trim();
      technology = iTech !== -1 ? resolveTech(cells[iTech]) : undefined;
    }

    if (!description || !category) {
      errors.push(`Row ${r + 1} (${sku}): missing description or subcategory — skipped.`);
      continue;
    }
    const price = num(cells[iPrice]);
    if (!Number.isFinite(price)) {
      errors.push(`Row ${r + 1} (${sku}): invalid/blank price — skipped.`);
      continue;
    }
    let cost = iCost !== -1 ? num(cells[iCost]) : NaN;
    if (!Number.isFinite(cost)) cost = price; // default cost to price when absent
    // Vendor / Source columns: when the file simply lacks the column, OMIT
    // the key entirely so downstream preserve-guards keep the existing
    // values (a legacy CSV re-import must not blank them). A present-but-
    // empty cell still sends '' so intentional clearing works.
    products.push({
      sku,
      description,
      category,
      ...(technology ? { technology } : {}),
      cost,
      price,
      ...(iVendor !== -1 ? { vendor: (cells[iVendor] || '').trim() } : {}),
      ...(iPreferredVendor !== -1 ? { preferred_vendor: (cells[iPreferredVendor] || '').trim() } : {}),
    });
  }
  return { products, errors };
}
