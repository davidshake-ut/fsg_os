// Estimates professional-labor hours per worker role from the actual Wi-Fi and
// camera design (AP/switch/IDF counts, cameras, NVRs, drops, licenses, …).
//
// PURE function → returns { [roleKey]: hours }. These are the up-front estimates
// shown in the labor rate card; the user can override any role (a numeric
// role.hours overrides; null/undefined uses the estimate — see calculateLabor).
//
// Role keys match DEFAULT_LABOR_ROLES in lib/defaults.js.
//
// Rates of thumb (per role):
//   Installation Technician — physical mounting, cabling, racks, NVRs
//   Network Engineer        — gateway/switch/Wi-Fi config + NVR/camera config
//   System Designer         — site planning, AP/camera placement, BOM (up front)
//   Project Manager         — coordination, scheduling, procurement oversight
//   Admin (overhead)        — procurement, finance, IT paperwork
export function estimateLaborHours({
  wifiBom = {},
  cameraBom = {},
  inputs = {},
  cameraInputs = {},
  // Per-technology { [roleKey]: hours } maps contributed by Tier-2
  // mini-calculators. Added on top of the Wi-Fi/Camera estimates; each
  // calculator includes its own PM/admin allocation (the flat baselines
  // below belong to the Wi-Fi/Camera designs and stay gated on them).
  techContributions = [],
} = {}) {
  // --- Wi-Fi design metrics ---
  const aps = Math.max(0, wifiBom.totalAPs || 0);
  const switches = (wifiBom.totalIdfSwitches || 0) + (wifiBom.needsAggSwitch ? 1 : 0);
  const wifiPresent = aps > 0 || switches > 0;
  // Takeoff mode reports the telecom-room count on the BOM itself.
  const idfs = wifiPresent ? Math.max(1, Number(wifiBom.idfCount ?? inputs.numberOfIDFs) || 1) : 0;
  const wiredDrops =
    (inputs.cat6Required ? Math.max(0, Number(inputs.cat6Drops) || 0) : 0) +
    Math.max(0, Number(inputs.guestRoomWiredConnections) || 0) +
    Math.max(0, Number(inputs.businessCenterWired) || 0);
  const b2b =
    inputs.b2bConnectionType && inputs.b2bConnectionType !== 'none'
      ? Math.max(0, Number(inputs.b2bConnectionQty) || 0)
      : 0;

  // --- Camera design metrics ---
  const cameras = Math.max(0, cameraBom.totalCameras || 0);
  const nvrs = Math.max(0, cameraBom.nvrCount || 0);
  const camPresent = cameras > 0;
  const aiLic = Math.max(0, Number(cameraInputs.aiLicenses) || 0);

  const anyPresent = wifiPresent || camPresent;
  const zero = {
    'install-tech': 0,
    'project-manager': 0,
    'network-engineer': 0,
    'system-designer': 0,
    'admin-overhead': 0,
  };

  // Sum the calculator contributions per role (unknown role keys ignored).
  const contrib = { ...zero };
  for (const c of techContributions) {
    for (const [key, hours] of Object.entries(c ?? {})) {
      if (key in contrib) contrib[key] += Math.max(0, Number(hours) || 0);
    }
  }
  const hasContrib = Object.values(contrib).some((h) => h > 0);
  if (!anyPresent && !hasContrib) return zero;

  // The Wi-Fi/Camera formulas apply only when those systems are present —
  // design inputs like B2B links or Cat6 drops belong to the Wi-Fi design
  // and must not leak into a contributions-only estimate.

  // --- Installation Technician: mount + cable + rack + NVR install ---
  //   AP ~0.5 hr, switch ~1 hr, IDF rack build ~2 hr, wired drop ~0.4 hr,
  //   B2B link ~3 hr; camera mount/aim ~0.75 hr, NVR ~1 hr.
  const installTech = !anyPresent ? 0 :
    aps * 0.5 + switches * 1 + idfs * 2 + wiredDrops * 0.4 + b2b * 3 + cameras * 0.75 + nvrs * 1;

  // --- Network Engineer: configuration & tuning ---
  //   Wi-Fi base 4 hr, switch config ~0.75 hr, AP provisioning/tuning ~0.1 hr,
  //   B2B ~1 hr; NVR config ~2 hr, camera onboarding ~0.15 hr, AI analytics setup.
  const networkEngineer = !anyPresent ? 0 :
    (wifiPresent ? 4 : 0) +
    switches * 0.75 +
    aps * 0.1 +
    b2b * 1 +
    nvrs * 2 +
    cameras * 0.15 +
    (aiLic > 0 ? 2 + aiLic * 0.1 : 0);

  // --- System Designer: site planning, placement, BOM (mostly up front) ---
  const systemDesigner = !anyPresent ? 0 :
    (wifiPresent ? 4 : 0) + aps * 0.15 + idfs * 0.5 + (camPresent ? 3 : 0) + cameras * 0.1;

  // --- Project Manager: coordination, scheduling, oversight ---
  const projectManager = !anyPresent ? 0 :
    6 + (aps + cameras) * 0.05 + idfs * 1 + switches * 0.25 + nvrs * 0.5;

  // --- Admin: procurement, finance, IT overhead ---
  const adminOverhead = !anyPresent ? 0 : 3 + (aps + cameras + switches + nvrs) * 0.03;

  const r = (h) => Math.max(0, Math.ceil(h));
  return {
    'install-tech': r(installTech + contrib['install-tech']),
    'project-manager': r(projectManager + contrib['project-manager']),
    'network-engineer': r(networkEngineer + contrib['network-engineer']),
    'system-designer': r(systemDesigner + contrib['system-designer']),
    'admin-overhead': r(adminOverhead + contrib['admin-overhead']),
  };
}
