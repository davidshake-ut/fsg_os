import { isAlternate, optionTags, optionGroups, comparisonRows, signed } from './vendorComparison';

// Multi-section BOM export. `sections` is [{ title, bom }, …] — each system
// (Managed Wi-Fi, Camera Systems) gets its own hardware + services + subtotal
// block, followed by a combined project grand total. A multi-vendor tech's
// Option-B alternates get their own tagged block, stay out of the grand
// total, and are compared side by side at the end.
export function exportCSV(inputs, sections, opts = {}) {
  const { fileSuffix = 'Quote', companyName = '' } = opts;
  const rows = [];
  if (companyName) rows.push([companyName]);
  rows.push([`Project: ${inputs.propertyName || 'Untitled Project'}`]);
  rows.push([]);
  let grandPrice = 0;
  const tags = optionTags(sections);

  for (const section of sections) {
    const { title, bom } = section;
    const hasHardware = bom.items.length > 0;
    const hasServices = bom.serviceItems && bom.serviceItems.length > 0;
    if (!hasHardware && !hasServices) continue;
    const tag = tags.get(section);
    const alternate = isAlternate(section);
    const heading = !tag
      ? title
      : tag.isPrimary
        ? `Option A — ${title}`
        : `Option ${tag.letter} (Alternate) — ${title}`;

    rows.push([`=== ${heading.toUpperCase()} ===`]);
    if (hasHardware) {
      rows.push(['Category', 'SKU', 'Description', 'Qty', 'Unit Price', 'Total Price']);
      for (const i of bom.items) {
        rows.push([i.category, i.sku, i.description, i.qty, i.unitPrice.toFixed(2), i.totalPrice.toFixed(2)]);
      }
    }

    if (hasServices) {
      if (hasHardware) {
        rows.push([]);
        rows.push([`${title} — Professional Services`]);
      } else {
        rows.push(['Role', '', 'Description', 'Hours', 'Rate', 'Total Price']);
      }
      for (const i of bom.serviceItems) {
        rows.push(['Labor', i.sku, i.description, i.qty, i.unitPrice.toFixed(2), i.totalPrice.toFixed(2)]);
      }
    }

    rows.push([]);
    if (hasHardware) {
      rows.push(['', '', `${title} Hardware Subtotal`, '', '', bom.totalHardwarePrice.toFixed(2)]);
    }
    if (hasServices) {
      const label = hasHardware ? 'Professional Services' : 'Professional Labor';
      rows.push(['', '', `${title} ${label}`, '', '', bom.totalServicesPrice.toFixed(2)]);
    }
    if (bom.shippingPrice > 0) {
      rows.push([
        '',
        '',
        `${title} Shipping (${bom.shippingPercent ?? 7}%)`,
        '',
        '',
        bom.shippingPrice.toFixed(2),
      ]);
    }
    rows.push([
      '',
      '',
      alternate ? `${title} Subtotal (Alternate — not in grand total)` : `${title} Subtotal`,
      '',
      '',
      bom.grandTotalPrice.toFixed(2),
    ]);
    rows.push([]);
    if (!alternate) grandPrice += bom.grandTotalPrice;
  }

  rows.push(['', '', 'PROJECT GRAND TOTAL', '', '', grandPrice.toFixed(2)]);

  // Option A / B comparison per multi-vendor technology (sell price only —
  // this export never carries cost).
  for (const group of optionGroups(sections)) {
    const alternates = group.options.filter((o) => !o.isPrimary);
    const fmt = (kind, v) => (kind === 'percent' ? `${v.toFixed(1)}%` : v.toFixed(2));
    rows.push([]);
    rows.push([`=== OPTION COMPARISON — ${group.label.toUpperCase()} ===`]);
    rows.push([
      'Category',
      ...group.options.map((o) => `Option ${o.letter} — ${o.vendorName}${o.isPrimary ? ' (Quoted)' : ''}`),
      ...alternates.map((o) => `Difference (${o.letter} vs A)`),
    ]);
    for (const row of comparisonRows(group)) {
      rows.push([
        row.label,
        ...row.values.map((v) => fmt(row.kind, v)),
        ...alternates.map((o) => {
          const d = row.deltas[group.options.indexOf(o)];
          return d === null ? '' : signed(d, (x) => fmt(row.kind, x));
        }),
      ]);
    }
  }

  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  downloadCSV(csv, `${(inputs.propertyName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}_${fileSuffix}.csv`);
}

// Generic rows-to-file export (Training dashboard etc.) — same quoting and
// download mechanics as the BOM export above.
export function exportRowsCSV(rows, filename) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  downloadCSV(csv, filename);
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Catalog export — the canonical import template. "Category" is the
// technology; the part type exports as "Subcategory". parseCatalogCSV
// round-trips this shape (and still accepts legacy files where Category
// held the part type).
export function exportCatalogCSV(products, { includeCost = true, techLabelOf = null } = {}) {
  const header = ['SKU', 'Description', 'Category', 'Subcategory', ...(includeCost ? ['Cost'] : []), 'Price', 'Vendor', 'Source / Distributor'];
  const rows = [
    header,
    ...products.map((p) => [
      p.sku,
      p.desc ?? p.description ?? '',
      techLabelOf ? techLabelOf(p) : (p.technology ?? ''),
      p.category,
      ...(includeCost ? [Number(p.cost).toFixed(2)] : []),
      Number(p.price).toFixed(2),
      p.vendor ?? '',
      p.preferred_vendor ?? '',
    ]),
  ];
  const csv = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  downloadCSV(csv, 'Product_Catalog.csv');
}
