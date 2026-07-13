// Smart Apartment IoT mini-calculator math (spec: David, 2026-07-13).
// Count the devices, pick which catalog product each device type maps to,
// and the calculator emits priced hardware lines plus install labor:
//   Smart Locks 1.0 hr · Thermostats 0.75 hr · Leak Detectors 0.5 hr ·
//   Smart Lights 0.5 hr (excludable — usually installed by the electrician).
// Labor estimates work without product selections (install-only jobs);
// hardware lines appear once a product is chosen for the device type.

export const SMART_APARTMENT_DEVICES = [
  { key: 'smartLocks',       skuKey: 'lockSku',       label: 'Smart Locks',       hoursEach: 1 },
  { key: 'smartThermostats', skuKey: 'thermostatSku', label: 'Smart Thermostats', hoursEach: 0.75 },
  { key: 'leakDetectors',    skuKey: 'leakSku',       label: 'Leak Detectors',    hoursEach: 0.5 },
  { key: 'smartLights',      skuKey: 'lightSku',      label: 'Smart Lights',      hoursEach: 0.5, byOthersKey: 'lightsInstalledByOthers' },
];

export const SMART_APARTMENT_DEFAULTS = {
  smartLocks: 0,
  smartThermostats: 0,
  leakDetectors: 0,
  smartLights: 0,
  lockSku: '',
  thermostatSku: '',
  leakSku: '',
  lightSku: '',
  lightsInstalledByOthers: false,
};

export function computeSmartApartmentLines(value = {}, products = []) {
  const lines = [];
  for (const d of SMART_APARTMENT_DEVICES) {
    const qty = Math.max(0, Number(value[d.key]) || 0);
    const sku = value[d.skuKey];
    if (qty <= 0 || !sku) continue;
    const p = products.find((prod) => prod.sku === sku);
    if (!p) continue;
    lines.push({
      sku: p.sku,
      description: p.desc,
      category: p.category || 'Accessories',
      qty,
      cost: Number(p.cost) || 0,
      price: Number(p.price) || 0,
    });
  }
  return lines;
}

// Per David's spec this technology only estimates Installation Technician
// hours — no PM/admin baseline is invented for it; the rate card's manual
// override covers anything extra until he specs more roles.
export function smartApartmentLaborHours(value = {}) {
  let hours = 0;
  for (const d of SMART_APARTMENT_DEVICES) {
    if (d.byOthersKey && value[d.byOthersKey]) continue;
    hours += Math.max(0, Number(value[d.key]) || 0) * d.hoursEach;
  }
  return { 'install-tech': hours };
}
