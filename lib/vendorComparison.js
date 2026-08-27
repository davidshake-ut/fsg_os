// Option A / Option B helpers over the Builder's `sections` seam
// (app/builder/page.jsx exportSections). A vendored technology with two or
// more enabled vendors emits one section per vendor, tagged
// { optionGroup: techId, techLabel, isPrimary, vendorId, vendorName }. The
// primary vendor is Option A — the quoted total — and every other vendor is
// an alternate (Option B, C, …): the same system priced again, so it must
// never add to totals, saved prices, snapshots, or asset generation.
//
// Pure module. Consumers: CostSummary, VendorComparison, exportPDF,
// exportProposal, exportCSV, and the Builder's totals/snapshot helpers.

export function hasContent(section) {
  const bom = section?.bom;
  if (!bom) return false;
  return (bom.items?.length ?? 0) > 0 || (bom.serviceItems?.length ?? 0) > 0;
}

export function isAlternate(section) {
  return section?.optionGroup != null && section.isPrimary === false;
}

// The sections that count: everything except Option-B alternates.
export function primarySections(sections) {
  return (sections ?? []).filter((s) => !isAlternate(s));
}

export function optionLetter(index) {
  return String.fromCharCode(65 + Math.max(0, Math.min(25, index)));
}

function groupLabel(section) {
  return section.techLabel ?? section.label ?? section.title ?? '';
}

// Map<section, { letter, isPrimary, groupLabel }> for every option section,
// content or not. The primary is always A; alternates take B, C, … in
// section order, so an alternate keeps its letter even when Option A has
// nothing quoted yet.
export function optionTags(sections) {
  const tags = new Map();
  const altCount = new Map();
  for (const s of sections ?? []) {
    if (s?.optionGroup == null) continue;
    const label = groupLabel(s);
    if (s.isPrimary !== false) {
      tags.set(s, { letter: 'A', isPrimary: true, groupLabel: label });
    } else {
      const n = altCount.get(s.optionGroup) ?? 0;
      altCount.set(s.optionGroup, n + 1);
      tags.set(s, { letter: optionLetter(n + 1), isPrimary: false, groupLabel: label });
    }
  }
  return tags;
}

// Document heading for a section: plain outside a group, tagged inside one.
export function optionTitle(section, tags) {
  const tag = tags?.get(section);
  if (!tag) return section.title;
  return tag.isPrimary
    ? `Option A — ${section.title}`
    : `Option ${tag.letter} (Alternate) — ${section.title}`;
}

// [{ techId, label, options: [{ section, letter, isPrimary, vendorName }] }]
// — one per technology with at least two option sections that have
// content, primary first. Groups are what the comparison tables render.
export function optionGroups(sections) {
  const tags = optionTags(sections);
  const byTech = new Map();
  for (const s of sections ?? []) {
    const tag = tags.get(s);
    if (!tag || !hasContent(s)) continue;
    if (!byTech.has(s.optionGroup)) {
      byTech.set(s.optionGroup, { techId: s.optionGroup, label: tag.groupLabel, options: [] });
    }
    byTech.get(s.optionGroup).options.push({
      section: s,
      letter: tag.letter,
      isPrimary: tag.isPrimary,
      vendorName: s.vendorName ?? s.title,
    });
  }
  const out = [];
  for (const g of byTech.values()) {
    if (g.options.length < 2) continue;
    g.options.sort(
      (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.letter.localeCompare(b.letter)
    );
    out.push(g);
  }
  return out;
}

const marginOf = (cost, price) => (price > 0 ? ((price - cost) / price) * 100 : 0);

// Rows = [{ label, kind: 'money'|'percent', values[], deltas[], higherIsBetter }]
// with one value per option (group order) and each delta measured against
// Option A (null on A itself, or everywhere when no primary is present).
// Optional rows drop out when every option is zero.
function buildRows(group, defs) {
  const boms = group.options.map((o) => o.section.bom ?? {});
  const baseIdx = group.options.findIndex((o) => o.isPrimary);
  return defs
    .map(({ label, pick, kind = 'money', optional = false, higherIsBetter = false }) => {
      const values = boms.map((b) => Number(pick(b)) || 0);
      const deltas = values.map((v, i) => (baseIdx < 0 || i === baseIdx ? null : v - values[baseIdx]));
      return { label, kind, values, deltas, optional, higherIsBetter };
    })
    .filter((r) => !r.optional || r.values.some((v) => v !== 0));
}

// Internal (cost-aware) comparison: the Builder's Summary and the budgetary
// quote PDF. Cost / profit / margin rows only when the viewer may see cost.
export function comparisonRows(group, { includeMargin = false } = {}) {
  return buildRows(group, [
    { label: 'Hardware & Software', pick: (b) => b.totalHardwarePrice, optional: true },
    { label: 'Professional Services', pick: (b) => b.totalServicesPrice, optional: true },
    { label: 'Estimated Shipping', pick: (b) => b.shippingPrice, optional: true },
    { label: 'Total', pick: (b) => b.grandTotalPrice },
    ...(includeMargin
      ? [
          { label: 'Our Cost', pick: (b) => b.grandTotalCost },
          {
            label: 'Gross Profit',
            pick: (b) => (b.grandTotalPrice ?? 0) - (b.grandTotalCost ?? 0),
            higherIsBetter: true,
          },
          {
            label: 'Margin',
            pick: (b) => marginOf(b.grandTotalCost ?? 0, b.grandTotalPrice ?? 0),
            kind: 'percent',
            higherIsBetter: true,
          },
        ]
      : []),
  ]);
}

// Customer-safe comparison for the proposal: sell price only, shipping
// rolled into hardware exactly like the Investment Summary.
export function customerComparisonRows(group) {
  return buildRows(group, [
    {
      label: 'Hardware & Equipment',
      pick: (b) => (b.totalHardwarePrice ?? 0) + (b.shippingPrice ?? 0),
      optional: true,
    },
    { label: 'Installation & Labor', pick: (b) => b.totalServicesPrice, optional: true },
    { label: 'Total Investment', pick: (b) => b.grandTotalPrice },
  ]);
}

// "+$1,200.00" / "-$300.00" / "$0.00" — a plain hyphen so PDF fonts and
// CSV readers both render it.
export function signed(n, fmt) {
  const v = Number(n) || 0;
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${fmt(Math.abs(v))}`;
}
