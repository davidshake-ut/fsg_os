import { describe, it, expect } from 'vitest';
import { estimateLaborHours } from '../lib/estimateLaborHours';

const ROLES = [
  'install-tech',
  'project-manager',
  'network-engineer',
  'system-designer',
  'admin-overhead',
];

describe('estimateLaborHours', () => {
  it('no systems → every role is zero', () => {
    const est = estimateLaborHours({});
    for (const k of ROLES) expect(est[k]).toBe(0);
  });

  it('Wi-Fi design produces non-zero hours for every role', () => {
    const est = estimateLaborHours({
      wifiBom: { totalAPs: 50, totalIdfSwitches: 2, needsAggSwitch: true },
      inputs: { numberOfIDFs: 2 },
    });
    // install = 50*0.5 + 3 switches*1 + 2 IDFs*2 = 32
    expect(est['install-tech']).toBe(32);
    for (const k of ROLES) expect(est[k]).toBeGreaterThan(0);
  });

  it('install hours scale up with the access-point count', () => {
    const small = estimateLaborHours({ wifiBom: { totalAPs: 20 }, inputs: { numberOfIDFs: 1 } });
    const big = estimateLaborHours({ wifiBom: { totalAPs: 200 }, inputs: { numberOfIDFs: 1 } });
    expect(big['install-tech']).toBeGreaterThan(small['install-tech']);
  });

  it('cameras drive technician + network-engineer hours', () => {
    const est = estimateLaborHours({
      cameraBom: { totalCameras: 16, nvrCount: 2 },
    });
    // camera-only install = 16*0.75 + 2*1 = 14
    expect(est['install-tech']).toBe(14);
    expect(est['network-engineer']).toBeGreaterThan(0);
  });

  it('AI licenses add network-engineer configuration time', () => {
    const base = { cameraBom: { totalCameras: 16, nvrCount: 2 } };
    const withLic = estimateLaborHours({ ...base, cameraInputs: { aiLicenses: 8 } });
    const without = estimateLaborHours(base);
    expect(withLic['network-engineer']).toBeGreaterThan(without['network-engineer']);
  });

  it('Wi-Fi + cameras combine across the technician role', () => {
    const both = estimateLaborHours({
      wifiBom: { totalAPs: 50, totalIdfSwitches: 2, needsAggSwitch: true },
      cameraBom: { totalCameras: 16, nvrCount: 2 },
      inputs: { numberOfIDFs: 2 },
    });
    expect(both['install-tech']).toBe(32 + 14); // wifi 32 + camera 14
  });

  it('calculator contributions stand alone — Wi-Fi baselines and inputs must not leak', () => {
    const est = estimateLaborHours({
      // Wi-Fi-design inputs present but no Wi-Fi/Camera system quoted:
      inputs: { b2bConnectionType: 'fiber', b2bConnectionQty: 2, cat6Required: true, cat6Drops: 50 },
      techContributions: [{ 'install-tech': 10, 'project-manager': 2 }],
    });
    expect(est['install-tech']).toBe(10); // no b2b/cat6 leak-through
    expect(est['project-manager']).toBe(2); // no flat PM baseline
    expect(est['network-engineer']).toBe(0);
    expect(est['system-designer']).toBe(0);
    expect(est['admin-overhead']).toBe(0);
  });

  it('contributions add on top of the Wi-Fi estimate and sum across techs', () => {
    const base = {
      wifiBom: { totalAPs: 50, totalIdfSwitches: 2, needsAggSwitch: true },
      inputs: { numberOfIDFs: 2 },
    };
    const est = estimateLaborHours({
      ...base,
      techContributions: [{ 'install-tech': 4 }, { 'install-tech': 6 }],
    });
    expect(est['install-tech']).toBe(32 + 10);
  });

  it('unknown role keys in contributions are ignored', () => {
    const est = estimateLaborHours({ techContributions: [{ 'made-up-role': 5 }] });
    for (const k of ROLES) expect(est[k]).toBe(0);
  });
});
