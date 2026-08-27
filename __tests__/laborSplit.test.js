import { describe, it, expect } from 'vitest';
import { taskTechId, estimateLaborHoursByTech, splitLaborHours, laborLinesFor, attachLabor, laborLinesOf, nonLaborServicesOf } from '../lib/laborSplit';
import { estimateLaborHours } from '../lib/estimateLaborHours';
import { DEFAULT_LABOR_TASKS, MULTIFAMILY_TAKEOFF_TASKS } from '../lib/laborTasks';
import { DEFAULT_LABOR_ROLES } from '../lib/defaults';
import { calculateLabor } from '../lib/calculateLabor';

const wifiBom = { totalAPs: 120, totalIdfSwitches: 6, needsAggSwitch: true, idfCount: 3, idfSwitches24: 4, idfSwitches48: 2, unitCount: 100 };
const cameraBom = { totalCameras: 40, nvrCount: 2 };
const sum = (o) => Object.values(o ?? {}).reduce((s, h) => s + h, 0);

describe('taskTechId', () => {
  it('maps drivers and gates to the technology that owns them', () => {
    expect(taskTechId({ driver: 'aps' })).toBe('managed_wifi');
    expect(taskTechId({ driver: 'idfs' })).toBe('managed_wifi');
    expect(taskTechId({ driver: 'cameras' })).toBe('video_surveillance');
    expect(taskTechId({ driver: 'aiLicenses' })).toBe('video_surveillance');
    expect(taskTechId({ driver: 'flat', when: 'wifi' })).toBe('managed_wifi');
    expect(taskTechId({ driver: 'flat', when: 'camera' })).toBe('video_surveillance');
    expect(taskTechId({ driver: 'flat', when: 'ai' })).toBe('video_surveillance');
    expect(taskTechId({ driver: 'flat', when: 'any' })).toBeNull();
  });
});

describe('estimateLaborHoursByTech', () => {
  it('totals match estimateLaborHours exactly and the attribution + shared account for every hour', () => {
    const contributions = [{ techId: 'digital_infrastructure', hours: { 'install-tech': 560, 'project-manager': 10 } }];
    const args = { wifiBom, cameraBom, inputs: { numberOfIDFs: 3 }, cameraInputs: { aiLicenses: 5 }, techContributions: contributions, tasks: DEFAULT_LABOR_TASKS };
    const byTech = estimateLaborHoursByTech(args);
    const plain = estimateLaborHours({ ...args, techContributions: contributions.map((c) => c.hours) });
    expect(byTech.total).toEqual(plain);
    for (const role of Object.keys(plain)) {
      const raw = (byTech.shared[role] ?? 0) + Object.values(byTech.attributed).reduce((s, t) => s + (t[role] ?? 0), 0);
      expect(Math.ceil(raw)).toBe(plain[role]);
    }
    expect(byTech.attributed.managed_wifi['install-tech']).toBeCloseTo(120 * 0.5 + 7 * 1 + 3 * 2, 6);
    expect(byTech.attributed.video_surveillance['install-tech']).toBeCloseTo(40 * 0.75 + 2 * 1, 6);
    expect(byTech.attributed.digital_infrastructure['install-tech']).toBe(560);
    // The flat "any" rows (the PM baseline, admin overhead) are shared; every
    // per-driver row belongs to a technology.
    expect(byTech.shared['project-manager']).toBe(6);
    expect(Object.keys(byTech.shared)).toEqual(expect.arrayContaining(['project-manager']));
    expect(byTech.shared['install-tech']).toBeUndefined();
  });
  it('nothing designed → nothing attributed; a calculator alone still counts', () => {
    const none = estimateLaborHoursByTech({});
    expect(sum(none.total)).toBe(0);
    const di = estimateLaborHoursByTech({ techContributions: [{ techId: 'digital_infrastructure', hours: { 'install-tech': 12 } }] });
    expect(di.total['install-tech']).toBe(12);
    expect(di.attributed.digital_infrastructure['install-tech']).toBe(12);
  });
});

describe('splitLaborHours', () => {
  const est = estimateLaborHoursByTech({ wifiBom, cameraBom, techContributions: [{ techId: 'digital_infrastructure', hours: { 'install-tech': 560 } }] });
  const ids = ['digital_infrastructure', 'managed_wifi', 'video_surveillance'];

  it('every role sums to the rate card (estimate or override) across the quoted technologies', () => {
    const roles = DEFAULT_LABOR_ROLES.map((r) => (r.key === 'install-tech' ? { ...r, hours: 1000 } : { ...r, hours: null }));
    const split = splitLaborHours({ ...est, techIds: ids, roles });
    for (const role of Object.keys(est.total)) {
      const expected = role === 'install-tech' ? 1000 : est.total[role];
      const got = ids.reduce((s, id) => s + (split[id][role] ?? 0), 0);
      expect(got).toBeCloseTo(expected, 6);
    }
    // Proportional: DI carries 560 of 560 + 73 + 32 install hours.
    const raw = 560 + (120 * 0.5 + 7 + 6) + (40 * 0.75 + 2);
    expect(split.digital_infrastructure['install-tech']).toBeCloseTo(1000 * (560 / raw), 1);
  });
  it('shared-only roles follow each technology\'s overall weight; a technology without attribution gets its share of shared', () => {
    const split = splitLaborHours({ ...est, techIds: ids, roles: DEFAULT_LABOR_ROLES });
    const pm = est.total['project-manager'];
    expect(ids.reduce((s, id) => s + (split[id]['project-manager'] ?? 0), 0)).toBeCloseTo(pm, 6);
    // DI has no PM tasks of its own but still shares the baseline by weight.
    expect(split.digital_infrastructure['project-manager']).toBeGreaterThan(0);
  });
  it('attribution to an unquoted technology counts as shared; no technologies → nothing', () => {
    const split = splitLaborHours({ ...est, techIds: ['managed_wifi'], roles: DEFAULT_LABOR_ROLES });
    expect(split.managed_wifi['install-tech']).toBe(est.total['install-tech']); // camera + DI hours land on the only quoted tech
    expect(splitLaborHours({ ...est, techIds: [], roles: DEFAULT_LABOR_ROLES })).toEqual({});
  });
  it('splits evenly when nothing is attributed anywhere', () => {
    const split = splitLaborHours({ total: { 'project-manager': 7 }, shared: { 'project-manager': 7 }, techIds: ['a', 'b'], roles: [] });
    expect(split.a['project-manager'] + split.b['project-manager']).toBe(7);
    expect(Math.abs(split.a['project-manager'] - split.b['project-manager'])).toBeLessThanOrEqual(0.01);
  });
  it('the multifamily preset\'s flat PM / config / design rows are shared across the quoted systems, the per-device rows stay with Wi-Fi', () => {
    const est2 = estimateLaborHoursByTech({ wifiBom, tasks: MULTIFAMILY_TAKEOFF_TASKS });
    expect(est2.shared['project-manager']).toBe(400);
    expect(est2.attributed.managed_wifi['install-tech']).toBeGreaterThan(0);
    expect(est2.attributed.managed_wifi['project-manager']).toBeUndefined();
    // Quoted with Digital Infrastructure carrying most of the install hours, the
    // PM baseline follows that weight rather than staying with Wi-Fi.
    const split = splitLaborHours({ ...est2, attributed: { ...est2.attributed, digital_infrastructure: { 'install-tech': 560 } }, techIds: ['managed_wifi', 'digital_infrastructure'], roles: DEFAULT_LABOR_ROLES });
    expect(split.digital_infrastructure['project-manager']).toBeGreaterThan(split.managed_wifi['project-manager']);
    expect(split.digital_infrastructure['project-manager'] + split.managed_wifi['project-manager']).toBeCloseTo(400, 6);
  });
});

describe('laborLinesFor / attachLabor', () => {
  const roles = DEFAULT_LABOR_ROLES.map((r) => ({ ...r, hours: r.key === 'project-manager' ? 12 : null }));
  it('prices a technology\'s hours by the card and marks the lines as labor', () => {
    const lines = laborLinesFor(roles, { 'install-tech': 10.5, 'project-manager': 4 });
    expect(lines.map((l) => l.sku)).toEqual(['install-tech', 'project-manager']);
    expect(lines.every((l) => l.category === 'Labor' && l.isLabor && l.isService)).toBe(true);
    const tech = roles.find((r) => r.key === 'install-tech');
    expect(lines[0]).toMatchObject({ qty: 10.5, unitCost: tech.costRate, unitPrice: tech.billRate, totalPrice: 10.5 * tech.billRate });
    expect(lines[0].note).toContain('(est.)');
    expect(lines[1].note).not.toContain('(est.)'); // the PM role is overridden on the card
  });
  it('folds the lines into a section and moves the totals with them', () => {
    const section = { title: 'Managed Wi-Fi', techId: 'managed_wifi', bom: { items: [{ sku: 'x' }], serviceItems: [{ category: 'Cabling', totalCost: 100, totalPrice: 200 }], totalHardwareCost: 1000, totalHardwarePrice: 1500, totalServicesCost: 100, totalServicesPrice: 200, shippingCost: 70, shippingPrice: 105, grandTotalCost: 1170, grandTotalPrice: 1805 } };
    const lines = laborLinesFor(roles, { 'install-tech': 10 });
    const withLabor = attachLabor(section, lines);
    const t = roles.find((r) => r.key === 'install-tech');
    expect(withLabor.bom.totalLaborCost).toBe(10 * t.costRate);
    expect(withLabor.bom.totalServicesPrice).toBe(200 + 10 * t.billRate);
    expect(withLabor.bom.grandTotalPrice).toBe(1805 + 10 * t.billRate);
    expect(withLabor.bom.totalLaborHours).toBe(10);
    expect(laborLinesOf(withLabor.bom)).toHaveLength(1);
    expect(nonLaborServicesOf(withLabor.bom)).toHaveLength(1);
    expect(section.bom.serviceItems).toHaveLength(1); // the input is not mutated
    expect(attachLabor(section, [])).toBe(section);
  });
  it('the technologies\' labor adds up to the project-wide rate card', () => {
    const est = estimateLaborHoursByTech({ wifiBom, cameraBom });
    const split = splitLaborHours({ ...est, techIds: ['managed_wifi', 'video_surveillance'], roles });
    const perTech = ['managed_wifi', 'video_surveillance'].map((id) => laborLinesFor(roles, split[id]));
    const folded = perTech.flat().reduce((s, l) => s + l.totalPrice, 0);
    const card = calculateLabor(roles, est.total).totalServicesPrice;
    expect(folded).toBeCloseTo(card, 6);
  });
});
