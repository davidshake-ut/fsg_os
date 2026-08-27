// Professional labor per technology. The rate card stays one project-wide
// table (roles × rates × hours), but the hours are attributed to the
// technology that drives them — APs, switches, telecom rooms and drops to
// Managed Wi-Fi; cameras, NVRs and AI licenses to Video Surveillance; each
// calculator's own hours (kits, cabling, PON) to that calculator — and the
// shared items (the project-coordination baseline, anything gated on
// "any") are spread across the quoted technologies in proportion. Manual
// hour overrides on the rate card scale that role's split so every
// technology's labor still adds up to the card. Each technology's share is
// then folded into its section as labor lines, so the cost summary, the
// proposal, the CSV, and the saved summary all show labor per system and
// the systems' subtotals add up to the total. Pure.

import { laborMetrics } from './estimateLaborHours';
import { DEFAULT_LABOR_TASKS } from './laborTasks';
import { calculateLabor } from './calculateLabor';

const WIFI = 'managed_wifi';
const CAMERA = 'video_surveillance';
const DRIVER_TECH = {
  aps: WIFI,
  switches: WIFI,
  switches8: WIFI,
  switches24: WIFI,
  switches48: WIFI,
  idfs: WIFI,
  units: WIFI,
  wiredDrops: WIFI,
  b2b: WIFI,
  cameras: CAMERA,
  nvrs: CAMERA,
  aiLicenses: CAMERA,
};
const GATE_TECH = { wifi: WIFI, camera: CAMERA, ai: CAMERA };

const n0 = (v) => Math.max(0, Number(v) || 0);
const round2 = (n) => Math.round(n * 100) / 100;

// The technology a task's hours belong to, or null when shared (a flat
// task gated on "any").
export function taskTechId(task) {
  if (!task) return null;
  if (task.driver === 'flat') return GATE_TECH[task.when] ?? null;
  return DRIVER_TECH[task.driver] ?? null;
}

// Hours per role, attributed. `techContributions` = [{ techId, hours }]
// from the calculators. `total` matches estimateLaborHours exactly (the
// same sums, ceil'd per role); `attributed` and `shared` are the raw
// (un-ceil'd) hours behind it.
export function estimateLaborHoursByTech({
  wifiBom = {},
  cameraBom = {},
  inputs = {},
  cameraInputs = {},
  techContributions = [],
  tasks = DEFAULT_LABOR_TASKS,
} = {}) {
  const metrics = laborMetrics({ wifiBom, cameraBom, inputs, cameraInputs });
  const table = tasks ?? DEFAULT_LABOR_TASKS;
  const attributed = {};
  const shared = {};
  const add = (techId, role, hours) => {
    if (hours <= 0) return;
    if (techId) {
      attributed[techId] = attributed[techId] ?? {};
      attributed[techId][role] = (attributed[techId][role] ?? 0) + hours;
    } else {
      shared[role] = (shared[role] ?? 0) + hours;
    }
  };
  if (metrics.any) {
    for (const task of table) {
      if (!metrics[task.when]) continue;
      const units = task.driver === 'flat' ? task.qty : Number(metrics[task.driver]) || 0;
      if (units <= 0) continue;
      add(taskTechId(task), task.role, task.hours * units);
    }
  }
  const roles = new Set(['install-tech', 'project-manager', 'network-engineer', 'system-designer', 'admin-overhead', ...table.map((t) => t.role)]);
  for (const c of techContributions) {
    const map = c?.hours ?? c;
    for (const [role, hours] of Object.entries(map ?? {})) {
      if (roles.has(role)) add(c?.techId ?? null, role, n0(hours));
    }
  }
  const total = {};
  for (const role of roles) {
    let sum = shared[role] ?? 0;
    for (const t of Object.values(attributed)) sum += t[role] ?? 0;
    total[role] = Math.max(0, Math.ceil(sum));
  }
  return { total, attributed, shared };
}

// Splits each role's hours across `techIds` (the technologies that have a
// quoted section, in display order). roles = the rate card (a numeric
// role.hours overrides that role's total). Returns { [techId]: { [role]:
// hours } } whose sums equal the card exactly (cents of an hour go to the
// largest share). Attributions to a technology that is not quoted count
// as shared.
export function splitLaborHours({ total = {}, attributed = {}, shared = {}, techIds = [], roles = [] } = {}) {
  const out = {};
  const ids = [...new Set((techIds ?? []).filter(Boolean))];
  for (const id of ids) out[id] = {};
  if (ids.length === 0) return out;
  const quoted = new Set(ids);

  // Attributed hours per quoted tech per role; unquoted techs fold into shared.
  const attr = {};
  const sharedAll = { ...shared };
  for (const [techId, byRole] of Object.entries(attributed)) {
    for (const [role, h] of Object.entries(byRole ?? {})) {
      if (quoted.has(techId)) {
        attr[techId] = attr[techId] ?? {};
        attr[techId][role] = (attr[techId][role] ?? 0) + n0(h);
      } else {
        sharedAll[role] = (sharedAll[role] ?? 0) + n0(h);
      }
    }
  }
  // Each tech's overall weight, for roles that only have shared hours.
  const weight = Object.fromEntries(ids.map((id) => [id, Object.values(attr[id] ?? {}).reduce((s, h) => s + h, 0)]));
  const weightSum = Object.values(weight).reduce((s, w) => s + w, 0);

  const roleKeys = new Set([...Object.keys(total), ...Object.keys(sharedAll), ...ids.flatMap((id) => Object.keys(attr[id] ?? {}))]);
  for (const role of roleKeys) {
    const card = roles.find((r) => r.key === role);
    const roleTotal = card && card.hours !== null && card.hours !== undefined ? n0(card.hours) : n0(total[role]);
    if (roleTotal <= 0) continue;
    // Attributed hours stay with their technology; the role's shared hours
    // spread by each technology's overall labor weight (evenly when nothing
    // is attributed at all); then the whole is scaled to the card's total.
    const sharedHours = n0(sharedAll[role]);
    const base = ids.map((id, i) => {
      const w = weightSum > 0 ? weight[id] / weightSum : 1 / ids.length;
      return n0(attr[id]?.[role]) + sharedHours * w;
    });
    const baseSum = base.reduce((s, h) => s + h, 0);
    const shares = baseSum > 0 ? base.map((h) => h / baseSum) : ids.map(() => 1 / ids.length);
    const alloc = shares.map((s) => round2(roleTotal * s));
    const residual = round2(roleTotal - alloc.reduce((s, h) => s + h, 0));
    if (residual !== 0) {
      const i = alloc.indexOf(Math.max(...alloc));
      alloc[i] = round2(alloc[i] + residual);
    }
    ids.forEach((id, i) => {
      if (alloc[i] > 0) out[id][role] = alloc[i];
    });
  }
  return out;
}

// Labor lines for one technology from its share of the hours, priced by
// the rate card (an overridden role prints as such).
export function laborLinesFor(roles, hours) {
  const auto = roles.map((r) => ({ ...r, hours: null }));
  const result = calculateLabor(auto, hours ?? {});
  return result.serviceItems.map((line) => {
    const role = roles.find((r) => r.key === line.sku);
    const overridden = role && role.hours !== null && role.hours !== undefined;
    return {
      ...line,
      category: 'Labor',
      isLabor: true,
      isService: true,
      note: overridden ? line.note.replace(' (est.)', '') : line.note,
    };
  });
}

// A section with a technology's labor folded in: the lines join
// serviceItems (category 'Labor'), and the services / grand totals move
// with them. Returns the section untouched when there are no lines.
export function attachLabor(section, laborLines) {
  if (!section?.bom || !laborLines?.length) return section;
  const bom = section.bom;
  const cost = laborLines.reduce((s, l) => s + n0(l.totalCost), 0);
  const price = laborLines.reduce((s, l) => s + n0(l.totalPrice), 0);
  const hours = laborLines.reduce((s, l) => s + n0(l.qty), 0);
  const totalServicesCost = n0(bom.totalServicesCost) + cost;
  const totalServicesPrice = n0(bom.totalServicesPrice) + price;
  const grandTotalCost = n0(bom.grandTotalCost) + cost;
  const grandTotalPrice = n0(bom.grandTotalPrice) + price;
  return {
    ...section,
    bom: {
      ...bom,
      serviceItems: [...(bom.serviceItems ?? []), ...laborLines],
      laborItems: laborLines,
      totalLaborCost: cost,
      totalLaborPrice: price,
      totalLaborHours: hours,
      totalServicesCost,
      totalServicesPrice,
      grandTotalCost,
      grandTotalPrice,
      overallMargin: grandTotalPrice > 0 ? ((grandTotalPrice - grandTotalCost) / grandTotalPrice) * 100 : 0,
    },
  };
}

// Convenience for a bom: its labor lines and the rest of its services.
export function laborLinesOf(bom) {
  return (bom?.serviceItems ?? []).filter((l) => l.isLabor || l.category === 'Labor');
}
export function nonLaborServicesOf(bom) {
  return (bom?.serviceItems ?? []).filter((l) => !(l.isLabor || l.category === 'Labor'));
}
