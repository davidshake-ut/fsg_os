// Estimates professional-labor hours per worker role from the actual Wi-Fi and
// camera design (AP/switch/IDF counts, cameras, NVRs, drops, licenses, …).
//
// PURE function → returns { [roleKey]: hours }. These are the up-front estimates
// shown in the labor rate card; the user can override any role (a numeric
// role.hours overrides; null/undefined uses the estimate — see calculateLabor).
//
// Since Phase 5 of the complex-project Builder the hours come from a task
// table (lib/laborTasks.js): `hours` per unit of a design driver, credited
// to a role, gated on which systems are present. DEFAULT_LABOR_TASKS is
// the table the original formulas amounted to, so estimates are unchanged
// unless a team edits its table (companies.settings.laborTasks).
//
// Role keys match DEFAULT_LABOR_ROLES in lib/defaults.js.
import { DEFAULT_LABOR_TASKS, hoursFromTasks } from './laborTasks';

const BASE_ROLES = ['install-tech', 'project-manager', 'network-engineer', 'system-designer', 'admin-overhead'];

// The design drivers a task table can reference, from the two engines'
// results and the Wi-Fi inputs. Gates: any / wifi / camera / ai.
export function laborMetrics({ wifiBom = {}, cameraBom = {}, inputs = {}, cameraInputs = {} } = {}) {
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
  const cameras = Math.max(0, cameraBom.totalCameras || 0);
  const nvrs = Math.max(0, cameraBom.nvrCount || 0);
  const camPresent = cameras > 0;
  const aiLicenses = Math.max(0, Number(cameraInputs.aiLicenses) || 0);
  const anyPresent = wifiPresent || camPresent;

  return {
    aps,
    switches,
    switches8: Math.max(0, wifiBom.idfSwitches8 || 0),
    switches24: Math.max(0, wifiBom.idfSwitches24 || 0),
    switches48: Math.max(0, wifiBom.idfSwitches48 || 0),
    idfs,
    units: Math.max(0, Number(wifiBom.unitCount) || 0),
    wiredDrops,
    b2b,
    cameras,
    nvrs,
    aiLicenses,
    wifi: wifiPresent,
    camera: camPresent,
    ai: anyPresent && aiLicenses > 0,
    any: anyPresent,
  };
}

export function estimateLaborHours({
  wifiBom = {},
  cameraBom = {},
  inputs = {},
  cameraInputs = {},
  // Per-technology { [roleKey]: hours } maps contributed by Tier-2
  // mini-calculators. Added on top of the table's estimates; each
  // calculator includes its own PM/admin allocation (the flat blocks in the
  // table belong to the Wi-Fi/Camera designs and stay gated on them).
  techContributions = [],
  tasks = DEFAULT_LABOR_TASKS,
} = {}) {
  const metrics = laborMetrics({ wifiBom, cameraBom, inputs, cameraInputs });
  const fromTasks = metrics.any ? hoursFromTasks(tasks ?? DEFAULT_LABOR_TASKS, metrics) : {};

  // Sum the calculator contributions per role (unknown role keys ignored —
  // a role must exist in the table or the base rate card to receive hours).
  const roles = new Set([...BASE_ROLES, ...(tasks ?? []).map((t) => t.role)]);
  const contrib = {};
  for (const c of techContributions) {
    for (const [key, hours] of Object.entries(c ?? {})) {
      if (roles.has(key)) contrib[key] = (contrib[key] ?? 0) + Math.max(0, Number(hours) || 0);
    }
  }

  const r = (h) => Math.max(0, Math.ceil(h));
  const out = {};
  for (const role of roles) out[role] = r((fromTasks[role] ?? 0) + (contrib[role] ?? 0));
  return out;
}
