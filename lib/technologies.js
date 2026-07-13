// The canonical technology-category registry — the single list behind the
// Builder's tabs, the Overview toggles, the Product Database "Category"
// dimension, and (via LEGACY_TEMPLATE_TECH) template auto-generation.
// Built-ins are fixed and ordered; companies append their own custom
// technologies via companies.settings.customTechnologies.

// `calculator` is an informational marker for the two legacy engines; the
// behavior itself is registered in components/builder/calculators (the
// Tier-2 mini-calculator registry the Builder routes through).
export const BUILTIN_TECHNOLOGIES = [
  { id: 'digital_infrastructure', label: 'Digital Infrastructure' },
  { id: 'managed_wifi',           label: 'Managed Wi-Fi',      calculator: 'wifi' },
  { id: 'video_surveillance',     label: 'Video Surveillance', calculator: 'camera' },
  { id: 'access_control',         label: 'Access Control' },
  { id: 'smart_apartment',        label: 'Smart Apartment IoT' },
  { id: 'audio_video',            label: 'Audio/Video' },
  { id: 'ev_charging',            label: 'EV Charging' },
];

// Registry-id -> lib/templates technology name, so Create Project keeps
// finding task templates until Tier 3 re-keys the template world.
export const LEGACY_TEMPLATE_TECH = {
  digital_infrastructure: 'Fiber',
  managed_wifi:           'Managed Wi-Fi',
  video_surveillance:     'Camera Systems',
  access_control:         'Access Control',
  smart_apartment:        'Other',
  audio_video:            'Audio / Visual',
  ev_charging:            'Other',
};

// Built-ins + the company's custom technologies (admin-added on the
// Overview page; [{ id: 'custom_<uuid>', label }] in settings jsonb).
export function companyTechnologies(company) {
  const custom = Array.isArray(company?.settings?.customTechnologies)
    ? company.settings.customTechnologies.filter((t) => t?.id && t?.label)
    : [];
  return [...BUILTIN_TECHNOLOGIES, ...custom];
}

export function techLabel(techId, company) {
  return companyTechnologies(company).find((t) => t.id === techId)?.label
    ?? techId;
}

// Per-quote enabled map. Older quotes only carry includeWifi/includeCameras;
// inputs.technologies (when present) wins. Unknown/custom techs default off.
export function resolveEnabledTechnologies(inputs) {
  const legacy = {
    managed_wifi:       inputs?.includeWifi !== false,
    video_surveillance: inputs?.includeCameras !== false,
  };
  if (inputs?.technologies && typeof inputs.technologies === 'object') {
    return { ...legacy, ...inputs.technologies };
  }
  return legacy;
}

// Ordered ids of the technologies enabled on this quote (registry order,
// custom technologies after the built-ins).
export function enabledTechIds(inputs, company) {
  const enabled = resolveEnabledTechnologies(inputs);
  return companyTechnologies(company)
    .map((t) => t.id)
    .filter((id) => enabled[id]);
}
