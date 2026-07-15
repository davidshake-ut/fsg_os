// Per-technology vendor registry + per-quote vendor resolution — the pure
// core of the multi-vendor Builder (see the A/B vendor plan).
//
// Company registry lives at companies.settings.technologyVendors:
//   { [techId]: [{ id: 'vnd_<uuid8>', name: 'Cambium Networks' }, ...] }
// The entry NAME doubles as the exact custom_products.vendor match string
// (renaming a vendor rewrites matching products); the entry ID is what quote
// state references, so renames never orphan a quote.
//
// Quote state (rides the saved inputs jsonb):
//   inputs.techVendors        { [techId]: [{ id, name }] }  enabled here,
//     with the name snapshotted at enable time — display prefers the live
//     registry name; the snapshot keeps deleted vendors rendering.
//   inputs.techVendorPrimary  { [techId]: vendorId }        Option A.
//
// Invariants:
//   1. Registry empty → vendorless: [] from resolveQuoteVendors, and the
//      tech behaves exactly as before this feature existed.
//   2. techVendors absent (legacy quote) → [registry[0]] — one tab, no
//      Option-B machinery, totals unchanged.
//   3. A line's bucket coalesces to the primary vendor whenever its own
//      vendor isn't enabled (legacy lines, disabled vendors, deleted
//      vendors) — no line is ever dropped from the quote.
//
// The registry's index-0 vendor hosts the legacy design calculator on
// managed_wifi / video_surveillance (callers pass hasEngine).

export function newVendorId() {
  const raw =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.floor(Math.random() * 1e8).toString(16)}`;
  return `vnd_${raw.slice(0, 8)}`;
}

// Validated registry entries for one technology (order preserved).
export function companyTechVendors(company, techId) {
  const map = company?.settings?.technologyVendors;
  const list = map && typeof map === 'object' ? map[techId] : null;
  if (!Array.isArray(list)) return [];
  return list.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim());
}

// The vendors active on THIS quote for a technology, in render order:
// registry-ordered enabled entries first, then snapshot-only entries whose
// registry vendor was deleted (kept alive under their last-known name).
// Returns [] when the company has no registry for the tech (vendorless).
export function resolveQuoteVendors(inputs, company, techId, hasEngine = false) {
  const registry = companyTechVendors(company, techId);
  if (registry.length === 0) return [];

  const saved = inputs?.techVendors?.[techId];
  const savedList = Array.isArray(saved)
    ? saved.filter((v) => v && typeof v.id === 'string')
    : null;

  let enabled;
  if (!savedList || savedList.length === 0) {
    enabled = [registry[0]];
  } else {
    const savedIds = new Set(savedList.map((v) => v.id));
    const registryIds = new Set(registry.map((v) => v.id));
    // Registry order for live entries; live registry name wins over snapshot.
    const live = registry.filter((v) => savedIds.has(v.id));
    const orphaned = savedList.filter((v) => !registryIds.has(v.id) && v.name);
    enabled = [...live, ...orphaned];
    if (enabled.length === 0) enabled = [registry[0]];
  }

  const primarySaved = inputs?.techVendorPrimary?.[techId];
  const primaryId = enabled.some((v) => v.id === primarySaved) ? primarySaved : enabled[0].id;
  const engineId = hasEngine ? registry[0].id : null;

  return enabled.map((v) => ({
    id: v.id,
    name: v.name,
    isPrimary: v.id === primaryId,
    isEngine: v.id === engineId,
  }));
}

// Which enabled vendor a quote line belongs to: its own vendor when that
// vendor is enabled, otherwise the primary (invariant 3).
export function lineVendorId(line, enabledIds, primaryId) {
  return line?.vendor && enabledIds.includes(line.vendor) ? line.vendor : primaryId;
}

// The lines that roll up under one vendor's tab/section.
export function linesForVendor(lines, techId, vendorId, enabledIds, primaryId) {
  return (lines ?? []).filter(
    (l) => l.system === techId && lineVendorId(l, enabledIds, primaryId) === vendorId
  );
}
