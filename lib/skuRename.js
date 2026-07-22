// SKU rename helpers — when the super admin renames a custom product's SKU,
// existing proposals that reference the old SKU can be migrated to the new
// one while keeping every other value. A saved proposal can reference a SKU
// in five places:
//   price_overrides    — jsonb object keyed by SKU
//   custom_line_items  — array of { sku, … }
//   catalog_snapshot   — jsonb keyed by SKU (locked quotes), rows carry .sku
//   inputs.techCalc    — tech mini-calculator lines carry .sku
//   bom_snapshot       — frozen computed BOM lines carry .sku

// Recursively rename `from` → `to` wherever it appears as an object KEY
// (sku-keyed maps) or as a string VALUE under a sku-ish property (sku,
// baseSku, license_sku_1yr, …). Descriptions or notes that merely mention
// the SKU text are deliberately left untouched.
export function deepRenameSku(value, from, to) {
  if (Array.isArray(value)) return value.map((v) => deepRenameSku(v, from, to));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k === from ? to : k;
      out[key] = typeof v === 'string' && v === from && /sku/i.test(k)
        ? to
        : deepRenameSku(v, from, to);
    }
    return out;
  }
  return value;
}

// Where (if anywhere) a saved proposal row references the SKU. Returns an
// array of human-readable location labels; empty = not referenced.
export function proposalSkuRefs(project, sku) {
  const refs = [];
  if (project?.price_overrides && Object.prototype.hasOwnProperty.call(project.price_overrides, sku)) {
    refs.push('price override');
  }
  if (Array.isArray(project?.custom_line_items) && project.custom_line_items.some((l) => l?.sku === sku)) {
    refs.push('custom line item');
  }
  if (project?.catalog_snapshot && Object.prototype.hasOwnProperty.call(project.catalog_snapshot, sku)) {
    refs.push('locked price snapshot');
  }
  if (project?.inputs?.techCalc && JSON.stringify(project.inputs.techCalc).includes(`"${sku}"`)) {
    refs.push('design selections');
  }
  if (project?.bom_snapshot && JSON.stringify(project.bom_snapshot).includes(`"${sku}"`)) {
    refs.push('saved BOM snapshot');
  }
  return refs;
}

// Build the update payload for one proposal row: only the columns that
// actually change. Returns null when nothing references the old SKU.
export function applySkuRename(project, from, to) {
  const patch = {};
  const maybe = (column, renamed) => {
    if (JSON.stringify(project[column] ?? null) !== JSON.stringify(renamed ?? null)) {
      patch[column] = renamed;
    }
  };
  if (project.price_overrides) maybe('price_overrides', deepRenameSku(project.price_overrides, from, to));
  if (project.custom_line_items) maybe('custom_line_items', deepRenameSku(project.custom_line_items, from, to));
  if (project.catalog_snapshot) maybe('catalog_snapshot', deepRenameSku(project.catalog_snapshot, from, to));
  if (project.bom_snapshot) maybe('bom_snapshot', deepRenameSku(project.bom_snapshot, from, to));
  if (project.inputs?.techCalc) {
    maybe('inputs', { ...project.inputs, techCalc: deepRenameSku(project.inputs.techCalc, from, to) });
  }
  return Object.keys(patch).length ? patch : null;
}
