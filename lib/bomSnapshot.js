// Helpers over saved_projects.bom_snapshot (the as-sold line items written
// by the Builder at Sent/Accepted — migration 0041).

// Categories that represent trackable installed hardware, as opposed to
// consumables (cable, mounting), services, or recurring items (licenses,
// subscriptions). Drives both the installed-equipment view and asset
// generation.
const HARDWARE_CATEGORIES = new Set([
  'Access Point', 'Switch', 'Aggregate Switch', 'Gateway',
  'Camera', 'NVR', 'UPS', 'Rack', 'Storage', 'Fiber Module',
  'Smart Device', 'Door Controller', 'EV Charger',
  'OLT', 'ONT', 'PoE Injector', // XGS-PON (Phase 8)
]);

const ASSET_TYPE_BY_CATEGORY = {
  'Access Point': 'access_point',
  'Switch': 'switch',
  'Aggregate Switch': 'switch',
  'Gateway': 'gateway',
  'Camera': 'camera',
  'NVR': 'nvr',
  'Smart Device': 'smart_device',
  'Door Controller': 'door_controller',
  'EV Charger': 'ev_charger',
};

export function isHardwareLine(line) {
  return HARDWARE_CATEGORIES.has(line?.category);
}

export function hardwareLines(bomSnapshot) {
  return (bomSnapshot ?? []).filter(isHardwareLine);
}

export function assetTypeForCategory(category) {
  return ASSET_TYPE_BY_CATEGORY[category] ?? 'other';
}

// One asset row per hardware line (quantity noted, serials filled in by
// techs later) — the shape hooks/useAssets.js's createAsset expects.
export function assetsFromSnapshot(bomSnapshot) {
  return hardwareLines(bomSnapshot).map((line) => ({
    name: line.description || line.sku || 'Hardware',
    asset_type: assetTypeForCategory(line.category),
    serial_number: null,
    location: null,
    notes: `Qty ${line.qty}${line.sku ? ` · ${line.sku}` : ''} · from accepted proposal`,
  }));
}
