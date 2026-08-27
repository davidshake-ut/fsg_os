import { describe, it, expect } from 'vitest';
import { DEFAULT_LABOR_TASKS, MULTIFAMILY_TAKEOFF_TASKS, LABOR_TASK_PRESETS, LABOR_DRIVERS, normalizeLaborTasks, hoursFromTasks } from '../lib/laborTasks';
import { estimateLaborHours, laborMetrics } from '../lib/estimateLaborHours';

// The formulas the app used before the table existed — the default table
// must reproduce them exactly (after the per-role ceil).
function legacy({ wifiBom = {}, cameraBom = {}, inputs = {}, cameraInputs = {} }) {
  const aps = Math.max(0, wifiBom.totalAPs || 0);
  const switches = (wifiBom.totalIdfSwitches || 0) + (wifiBom.needsAggSwitch ? 1 : 0);
  const wifiPresent = aps > 0 || switches > 0;
  const idfs = wifiPresent ? Math.max(1, Number(inputs.numberOfIDFs) || 1) : 0;
  const wiredDrops = (inputs.cat6Required ? Math.max(0, Number(inputs.cat6Drops) || 0) : 0) + Math.max(0, Number(inputs.guestRoomWiredConnections) || 0) + Math.max(0, Number(inputs.businessCenterWired) || 0);
  const b2b = inputs.b2bConnectionType && inputs.b2bConnectionType !== 'none' ? Math.max(0, Number(inputs.b2bConnectionQty) || 0) : 0;
  const cameras = Math.max(0, cameraBom.totalCameras || 0);
  const nvrs = Math.max(0, cameraBom.nvrCount || 0);
  const camPresent = cameras > 0;
  const aiLic = Math.max(0, Number(cameraInputs.aiLicenses) || 0);
  const anyPresent = wifiPresent || camPresent;
  const r = (h) => Math.max(0, Math.ceil(h));
  if (!anyPresent) return { 'install-tech': 0, 'project-manager': 0, 'network-engineer': 0, 'system-designer': 0, 'admin-overhead': 0 };
  return {
    'install-tech': r(aps * 0.5 + switches * 1 + idfs * 2 + wiredDrops * 0.4 + b2b * 3 + cameras * 0.75 + nvrs * 1),
    'network-engineer': r((wifiPresent ? 4 : 0) + switches * 0.75 + aps * 0.1 + b2b * 1 + nvrs * 2 + cameras * 0.15 + (aiLic > 0 ? 2 + aiLic * 0.1 : 0)),
    'system-designer': r((wifiPresent ? 4 : 0) + aps * 0.15 + idfs * 0.5 + (camPresent ? 3 : 0) + cameras * 0.1),
    'project-manager': r(6 + (aps + cameras) * 0.05 + idfs * 1 + switches * 0.25 + nvrs * 0.5),
    'admin-overhead': r(3 + (aps + cameras + switches + nvrs) * 0.03),
  };
}

const CASES = [
  { wifiBom: { totalAPs: 50, totalIdfSwitches: 2, needsAggSwitch: true }, inputs: { numberOfIDFs: 2 } },
  { wifiBom: { totalAPs: 137, totalIdfSwitches: 5, needsAggSwitch: true }, inputs: { numberOfIDFs: 3, cat6Required: true, cat6Drops: 17, guestRoomWiredConnections: 9, businessCenterWired: 4, b2bConnectionType: 'fiber', b2bConnectionQty: 2 } },
  { cameraBom: { totalCameras: 16, nvrCount: 2 }, cameraInputs: { aiLicenses: 8 } },
  { wifiBom: { totalAPs: 33, totalIdfSwitches: 1 }, cameraBom: { totalCameras: 7, nvrCount: 1 }, inputs: { numberOfIDFs: 1 }, cameraInputs: { aiLicenses: 3 } },
  { wifiBom: { totalAPs: 1 }, inputs: {} },
  { inputs: { b2bConnectionType: 'fiber', b2bConnectionQty: 2, cat6Required: true, cat6Drops: 50 } },
];

describe('the default task table reproduces the original formulas', () => {
  it.each(CASES.map((c, i) => [i, c]))('case %i', (_i, c) => {
    expect(estimateLaborHours(c)).toEqual(legacy(c));
    expect(estimateLaborHours({ ...c, tasks: DEFAULT_LABOR_TASKS })).toEqual(legacy(c));
  });

  it('contributions still add on top and unknown roles are ignored', () => {
    const base = CASES[0];
    const est = estimateLaborHours({ ...base, techContributions: [{ 'install-tech': 4, 'made-up': 9 }] });
    expect(est['install-tech']).toBe(legacy(base)['install-tech'] + 4);
    expect(est['made-up']).toBeUndefined();
  });
});

describe('task table mechanics', () => {
  it('laborMetrics exposes the drivers and gates', () => {
    const m = laborMetrics({ wifiBom: { totalAPs: 10, totalIdfSwitches: 3, idfSwitches8: 1, idfSwitches24: 1, idfSwitches48: 1, idfCount: 4, unitCount: 80 }, cameraInputs: { aiLicenses: 2 } });
    expect(m).toMatchObject({ aps: 10, switches: 3, switches8: 1, switches24: 1, switches48: 1, idfs: 4, units: 80, wifi: true, camera: false, ai: true, any: true });
  });

  it('hoursFromTasks multiplies, gates, and uses qty for flat tasks', () => {
    const tasks = [
      { key: 'a', role: 'install-tech', hours: 2, driver: 'switches24', when: 'any', qty: 1 },
      { key: 'b', role: 'install-tech', hours: 12, driver: 'flat', when: 'any', qty: 4 },
      { key: 'c', role: 'network-engineer', hours: 5, driver: 'flat', when: 'camera', qty: 1 },
    ];
    expect(hoursFromTasks(tasks, { switches24: 3, any: true, camera: false })).toEqual({ 'install-tech': 6 + 48 });
  });

  it('normalizeLaborTasks cleans rows and rejects unknown drivers; every preset normalizes to itself', () => {
    expect(normalizeLaborTasks(null)).toBeNull();
    expect(normalizeLaborTasks([{ role: 'x', driver: 'nope' }, {}])).toBeNull();
    const n = normalizeLaborTasks([{ role: ' install-tech ', driver: 'flat', hours: '3', qty: '2', when: 'sideways', label: ' Rack ' }]);
    expect(n).toEqual([{ key: 'task_1', label: 'Rack', role: 'install-tech', hours: 3, driver: 'flat', when: 'any', qty: 2 }]);
    for (const preset of Object.values(LABOR_TASK_PRESETS)) {
      expect(normalizeLaborTasks(preset.tasks)).toEqual(preset.tasks);
    }
    expect(Object.keys(LABOR_DRIVERS)).toContain('switches48');
  });

  it('a custom role in the table receives hours and contributions', () => {
    const tasks = [...MULTIFAMILY_TAKEOFF_TASKS, { key: 'x', label: 'Fiber splicing', role: 'fiber-tech', hours: 1, driver: 'units', when: 'any', qty: 1 }];
    const est = estimateLaborHours({ wifiBom: { totalAPs: 10, unitCount: 50 }, tasks, techContributions: [{ 'fiber-tech': 5 }] });
    expect(est['fiber-tech']).toBe(55);
    expect(est['project-manager']).toBe(400);
  });
});
