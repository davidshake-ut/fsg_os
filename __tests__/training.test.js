import { describe, it, expect } from 'vitest';
import {
  courseProgress,
  deriveAssignmentStatus,
  isOverdue,
  displayStatus,
  compareMyTraining,
  certStatus,
  certDaysUntilExpiry,
  compareCerts,
  reachedCertMilestones,
  nextCertMilestone,
  reminderVerb,
  resolveAssignmentTargets,
  partitionAssignmentPreview,
  daysBetween,
} from '../lib/training';

const TODAY = '2026-07-27';

describe('courseProgress', () => {
  it('is 0 with zero completed items', () => {
    expect(courseProgress(0, 4)).toBe(0);
  });
  it('reports partial completion', () => {
    expect(courseProgress(1, 4)).toBe(25);
    expect(courseProgress(2, 3)).toBe(67);
  });
  it('is 100 at full completion', () => {
    expect(courseProgress(4, 4)).toBe(100);
  });
  it('handles a course with no items', () => {
    expect(courseProgress(0, 0)).toBe(0);
    expect(courseProgress(3, 0)).toBe(0);
    expect(courseProgress(0, null)).toBe(0);
  });
  it('clamps when items were removed after completion', () => {
    // 4 completions recorded, course later trimmed to 3 items
    expect(courseProgress(4, 3)).toBe(100);
  });
  it('drops below 100 when items are added after completion', () => {
    expect(courseProgress(3, 4)).toBe(75);
  });
});

describe('deriveAssignmentStatus', () => {
  it('not_started with zero completions', () => {
    expect(deriveAssignmentStatus(0, 5)).toBe('not_started');
  });
  it('in_progress with partial completions', () => {
    expect(deriveAssignmentStatus(1, 5)).toBe('in_progress');
    expect(deriveAssignmentStatus(4, 5)).toBe('in_progress');
  });
  it('completed when all items complete', () => {
    expect(deriveAssignmentStatus(5, 5)).toBe('completed');
  });
  it('a course with no items is not_started, never completed', () => {
    expect(deriveAssignmentStatus(0, 0)).toBe('not_started');
  });
  it('returns to in_progress when an item is added after completion', () => {
    expect(deriveAssignmentStatus(5, 6)).toBe('in_progress');
  });
});

describe('isOverdue / displayStatus', () => {
  it('incomplete past-due is overdue', () => {
    const a = { status: 'in_progress', due_date: '2026-07-26' };
    expect(isOverdue(a, TODAY)).toBe(true);
    expect(displayStatus(a, TODAY)).toBe('overdue');
  });
  it('due today is not overdue', () => {
    expect(isOverdue({ status: 'not_started', due_date: TODAY }, TODAY)).toBe(false);
  });
  it('completed assignments are never overdue', () => {
    expect(isOverdue({ status: 'completed', due_date: '2020-01-01' }, TODAY)).toBe(false);
  });
  it('no due date is never overdue', () => {
    expect(isOverdue({ status: 'not_started', due_date: null }, TODAY)).toBe(false);
  });
});

describe('compareMyTraining sort', () => {
  it('orders overdue → nearest due → recently assigned', () => {
    const rows = [
      { id: 'recent',  status: 'not_started', due_date: null,         assigned_at: '2026-07-26T10:00:00Z' },
      { id: 'soon',    status: 'in_progress', due_date: '2026-08-01', assigned_at: '2026-07-01T10:00:00Z' },
      { id: 'overdue', status: 'not_started', due_date: '2026-07-20', assigned_at: '2026-06-01T10:00:00Z' },
      { id: 'later',   status: 'not_started', due_date: '2026-09-01', assigned_at: '2026-07-10T10:00:00Z' },
      { id: 'older',   status: 'not_started', due_date: null,         assigned_at: '2026-07-20T10:00:00Z' },
    ];
    const sorted = [...rows].sort((a, b) => compareMyTraining(a, b, TODAY)).map((r) => r.id);
    expect(sorted).toEqual(['overdue', 'soon', 'later', 'recent', 'older']);
  });
});

describe('certStatus', () => {
  it('non-expiring when expiry_date is null', () => {
    expect(certStatus({ expiry_date: null }, TODAY)).toBe('non_expiring');
  });
  it('active when expiry is beyond 90 days', () => {
    expect(certStatus({ expiry_date: '2026-10-26' }, TODAY)).toBe('active'); // 91 days
  });
  it('expiring_soon exactly at the 90-day boundary', () => {
    expect(certStatus({ expiry_date: '2026-10-25' }, TODAY)).toBe('expiring_soon'); // 90 days
  });
  it('expiring_soon within 60 and 30 days', () => {
    expect(certStatus({ expiry_date: '2026-09-25' }, TODAY)).toBe('expiring_soon'); // 60
    expect(certStatus({ expiry_date: '2026-08-26' }, TODAY)).toBe('expiring_soon'); // 30
  });
  it('expiring_soon on the expiry date itself', () => {
    expect(certStatus({ expiry_date: TODAY }, TODAY)).toBe('expiring_soon');
    expect(certDaysUntilExpiry({ expiry_date: TODAY }, TODAY)).toBe(0);
  });
  it('expired the day after expiry', () => {
    expect(certStatus({ expiry_date: '2026-07-26' }, TODAY)).toBe('expired');
    expect(certDaysUntilExpiry({ expiry_date: '2026-07-26' }, TODAY)).toBe(-1);
  });
  it('day math is timezone-safe across a DST boundary', () => {
    // US DST springs forward 2026-03-08; a naive local-time diff yields
    // 30.96 days and rounds wrong with floor-based math.
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(certStatus({ expiry_date: '2026-03-31' }, '2026-03-01')).toBe('expiring_soon');
  });
});

describe('compareCerts sort', () => {
  it('orders expired → expiring soon → active → non-expiring', () => {
    const certs = [
      { id: 'active',  name: 'A', expiry_date: '2027-06-01' },
      { id: 'none',    name: 'B', expiry_date: null },
      { id: 'soon2',   name: 'C', expiry_date: '2026-09-01' },
      { id: 'expired', name: 'D', expiry_date: '2026-01-01' },
      { id: 'soon1',   name: 'E', expiry_date: '2026-08-01' },
    ];
    const sorted = [...certs].sort((a, b) => compareCerts(a, b, TODAY)).map((c) => c.id);
    expect(sorted).toEqual(['expired', 'soon1', 'soon2', 'active', 'none']);
  });
});

describe('reachedCertMilestones + reminderVerb', () => {
  it('no milestones for far-future or non-expiring certs', () => {
    expect(reachedCertMilestones({ expiry_date: '2027-06-01' }, TODAY)).toEqual([]);
    expect(reachedCertMilestones({ expiry_date: null }, TODAY)).toEqual([]);
  });
  it('accumulates milestones as expiry approaches', () => {
    expect(reachedCertMilestones({ expiry_date: '2026-10-01' }, TODAY)).toEqual([90]);         // 66d
    expect(reachedCertMilestones({ expiry_date: '2026-08-20' }, TODAY)).toEqual([90, 60, 30]); // 24d
    expect(reachedCertMilestones({ expiry_date: TODAY }, TODAY)).toEqual([90, 60, 30, 0]);
    expect(reachedCertMilestones({ expiry_date: '2026-07-01' }, TODAY)).toEqual([0]);          // already expired
  });
  it('nextCertMilestone picks only the most urgent reached milestone', () => {
    expect(nextCertMilestone({ expiry_date: '2027-06-01' }, TODAY)).toBe(null);   // far future
    expect(nextCertMilestone({ expiry_date: null }, TODAY)).toBe(null);           // non-expiring
    expect(nextCertMilestone({ expiry_date: '2026-10-01' }, TODAY)).toBe(90);     // 66d out
    expect(nextCertMilestone({ expiry_date: '2026-08-20' }, TODAY)).toBe(30);     // 24d — no 90/60 backfill
    expect(nextCertMilestone({ expiry_date: TODAY }, TODAY)).toBe(0);             // expiry day
    expect(nextCertMilestone({ expiry_date: '2026-07-01' }, TODAY)).toBe(0);      // already expired
  });

  it('verbs are distinct per milestone (dedup keys)', () => {
    const verbs = [90, 60, 30, 0].map((m) => reminderVerb('cert_expiry', m));
    expect(new Set(verbs).size).toBe(4);
    expect(verbs[0]).toBe('training.cert_expiry_90');
  });
});

describe('resolveAssignmentTargets', () => {
  const users = [
    { id: 'u1', role: 'user' },
    { id: 'u2', role: 'user' },
    { id: 'u3', role: 'company_admin' },
    { id: 'u4', role: 'viewer' },
  ];

  it('resolves a single individual', () => {
    const r = resolveAssignmentTargets(users, { userIds: ['u1'] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'individual', user: { id: 'u1' } });
  });
  it('resolves multiple individuals without duplicates', () => {
    const r = resolveAssignmentTargets(users, { userIds: ['u1', 'u2', 'u1'] });
    expect(r.map((t) => t.user.id)).toEqual(['u1', 'u2']);
  });
  it('resolves a role to its current members with source preserved', () => {
    const r = resolveAssignmentTargets(users, { roles: ['user'] });
    expect(r.map((t) => t.user.id)).toEqual(['u1', 'u2']);
    expect(r.every((t) => t.source === 'role' && t.sourceReference === 'user')).toBe(true);
  });
  it('everyone excludes viewers', () => {
    const r = resolveAssignmentTargets(users, { everyone: true });
    expect(r.map((t) => t.user.id)).toEqual(['u1', 'u2', 'u3']);
  });
  it('individual selection wins over overlapping role/everyone sources', () => {
    const r = resolveAssignmentTargets(users, { userIds: ['u2'], roles: ['user'], everyone: true });
    expect(r.find((t) => t.user.id === 'u2').source).toBe('individual');
    expect(r.find((t) => t.user.id === 'u1').source).toBe('role');
    expect(r.find((t) => t.user.id === 'u3').source).toBe('everyone');
    expect(r).toHaveLength(3);
  });
  it('ignores unknown user ids', () => {
    expect(resolveAssignmentTargets(users, { userIds: ['nope'] })).toEqual([]);
  });
});

describe('partitionAssignmentPreview', () => {
  const targets = resolveAssignmentTargets(
    [{ id: 'u1', role: 'user' }, { id: 'u2', role: 'user' }, { id: 'u3', role: 'user' }],
    { everyone: true }
  );

  it('splits new vs already-assigned vs already-completed', () => {
    const existing = [
      { user_id: 'u2', status: 'in_progress' },
      { user_id: 'u3', status: 'completed' },
    ];
    const { toCreate, alreadyAssigned, alreadyCompleted } = partitionAssignmentPreview(targets, existing);
    expect(toCreate.map((t) => t.user.id)).toEqual(['u1']);
    expect(alreadyAssigned.map((t) => t.user.id)).toEqual(['u2']);
    expect(alreadyCompleted.map((t) => t.user.id)).toEqual(['u3']);
  });
  it('creates everything when nothing exists', () => {
    const { toCreate, alreadyAssigned, alreadyCompleted } = partitionAssignmentPreview(targets, []);
    expect(toCreate).toHaveLength(3);
    expect(alreadyAssigned).toHaveLength(0);
    expect(alreadyCompleted).toHaveLength(0);
  });
});
