// Training module shared logic — progress, status, certification expiry,
// and assignment-resolution calculations. Pure functions, no I/O: the same
// math backs the learner views, admin dashboard, and unit tests.
//
// All date parameters are date-only strings ('YYYY-MM-DD'). Comparisons and
// day-counting use Date.UTC on the parts, so results are identical in every
// timezone and across DST boundaries.

export const CERT_EXPIRING_SOON_DAYS = 90;
export const CERT_REMINDER_MILESTONES = [90, 60, 30, 0]; // days before expiry

function utcMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function todayStr(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Whole days from `fromStr` to `toStr` (negative if `toStr` is in the past).
export function daysBetween(fromStr, toStr) {
  return Math.round((utcMs(toStr) - utcMs(fromStr)) / 86400000);
}

// ── Progress ──────────────────────────────────────────────────────────────

// completed/total → integer percent. A course with no items has no progress
// to measure; report 0 (and deriveAssignmentStatus keeps it not_started).
export function courseProgress(completedCount, totalCount) {
  if (!totalCount || totalCount <= 0) return 0;
  const done = Math.max(0, Math.min(completedCount ?? 0, totalCount));
  return Math.round((done / totalCount) * 100);
}

// Status from live counts. Item additions/removals after assignment are
// handled automatically because the counts are always taken from the
// course's CURRENT items: completions for removed items are cascade-deleted,
// and newly added items lower the ratio back below 100%.
export function deriveAssignmentStatus(completedCount, totalCount) {
  if (!totalCount || totalCount <= 0) return 'not_started';
  if ((completedCount ?? 0) >= totalCount) return 'completed';
  if ((completedCount ?? 0) > 0) return 'in_progress';
  return 'not_started';
}

// Overdue is computed, never stored: incomplete + due date strictly in the
// past. Due today is NOT overdue.
export function isOverdue(assignment, today) {
  if (!assignment?.due_date) return false;
  if (assignment.status === 'completed') return false;
  return utcMs(assignment.due_date) < utcMs(today);
}

// Display status for a learner assignment ('overdue' folded in).
export function displayStatus(assignment, today) {
  return isOverdue(assignment, today) ? 'overdue' : (assignment?.status ?? 'not_started');
}

// Sort for My Training's incomplete list: overdue first (most overdue at
// top), then nearest due date, then most recently assigned.
export function compareMyTraining(a, b, today) {
  const aOver = isOverdue(a, today);
  const bOver = isOverdue(b, today);
  if (aOver !== bOver) return aOver ? -1 : 1;
  if (aOver && bOver) return utcMs(a.due_date) - utcMs(b.due_date);
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return utcMs(a.due_date) - utcMs(b.due_date);
  if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
  return (b.assigned_at ?? '').localeCompare(a.assigned_at ?? '');
}

// ── Certifications ────────────────────────────────────────────────────────

// 'non_expiring' | 'expired' | 'expiring_soon' | 'active'
export function certStatus(cert, today) {
  if (!cert?.expiry_date) return 'non_expiring';
  const days = daysBetween(today, cert.expiry_date);
  if (days < 0) return 'expired';
  if (days <= CERT_EXPIRING_SOON_DAYS) return 'expiring_soon';
  return 'active';
}

// Days until expiry (negative = days since expiry); null for non-expiring.
export function certDaysUntilExpiry(cert, today) {
  if (!cert?.expiry_date) return null;
  return daysBetween(today, cert.expiry_date);
}

// Sort: expired → expiring soon → active (soonest expiry first) → non-expiring.
const CERT_STATUS_RANK = { expired: 0, expiring_soon: 1, active: 2, non_expiring: 3 };
export function compareCerts(a, b, today) {
  const ra = CERT_STATUS_RANK[certStatus(a, today)];
  const rb = CERT_STATUS_RANK[certStatus(b, today)];
  if (ra !== rb) return ra - rb;
  if (a.expiry_date && b.expiry_date) return utcMs(a.expiry_date) - utcMs(b.expiry_date);
  return (a.name ?? '').localeCompare(b.name ?? '');
}

// Reminder milestones already reached for a certification: every configured
// milestone whose window has started (days remaining <= milestone). The
// caller sends at most the SMALLEST reached milestone that hasn't been
// notified yet — reminderVerb() gives the dedup key per milestone.
export function reachedCertMilestones(cert, today) {
  const days = certDaysUntilExpiry(cert, today);
  if (days == null) return [];
  return CERT_REMINDER_MILESTONES.filter((m) => days <= m && days >= 0)
    .concat(days < 0 ? [0] : [])
    .filter((m, i, arr) => arr.indexOf(m) === i);
}

// The single milestone a reminder should fire for right now: the SMALLEST
// (most urgent) reached milestone. Sending only this one means a cert first
// seen at 20 days out gets one "30-day" reminder — not a backfilled 90+60+30
// burst — and each later crossing (0-day) fires exactly once via its own
// dedup verb. Returns null when nothing is due.
export function nextCertMilestone(cert, today) {
  const reached = reachedCertMilestones(cert, today);
  return reached.length ? Math.min(...reached) : null;
}

// Notification verb doubling as the duplicate-prevention key:
// one (user, verb, entity_id) triple per milestone.
export function reminderVerb(kind, milestone) {
  return `training.${kind}_${milestone}`;
}

// ── Assignment resolution ─────────────────────────────────────────────────

// Resolve a selection to a deduped user list at assignment time.
// selection: { userIds?: [], roles?: [], everyone?: boolean }
// users: company roster [{ id, role, … }]. Viewers are excluded — they are
// read-only accounts and could never mark items complete.
// Returns [{ user, source, sourceReference }] — first matching source wins
// in priority order: individual > role > everyone.
export function resolveAssignmentTargets(users, selection = {}) {
  const { userIds = [], roles = [], everyone = false } = selection;
  const out = [];
  const seen = new Set();
  const add = (user, source, sourceReference = null) => {
    if (!user || seen.has(user.id) || user.role === 'viewer') return;
    seen.add(user.id);
    out.push({ user, source, sourceReference });
  };
  for (const id of userIds) add(users.find((u) => u.id === id), 'individual');
  for (const role of roles) {
    for (const u of users.filter((u) => u.role === role)) add(u, 'role', role);
  }
  if (everyone) for (const u of users) add(u, 'everyone');
  return out;
}

// Split resolved targets against existing assignments for the course:
// what will be created vs. skipped (already assigned / already completed).
export function partitionAssignmentPreview(targets, existingAssignments = []) {
  const byUser = new Map(existingAssignments.map((a) => [a.user_id, a]));
  const toCreate = [];
  const alreadyAssigned = [];
  const alreadyCompleted = [];
  for (const t of targets) {
    const existing = byUser.get(t.user.id);
    if (!existing) toCreate.push(t);
    else if (existing.status === 'completed') alreadyCompleted.push(t);
    else alreadyAssigned.push(t);
  }
  return { toCreate, alreadyAssigned, alreadyCompleted };
}
