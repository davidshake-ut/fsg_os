// Dependency date cascade — the scheduling half of task dependencies
// (psa_tasks.depends_on uuid[], migration 0027). Rule: a task starts after
// every task it depends on has finished (next business day). When a task's
// dates move, this computes the minimal FORWARD shifts for its dependents
// (and theirs, transitively) that restore the rule. Tasks are never pulled
// earlier — pulling work back automatically is rarely what a PM wants; the
// Gantt's red conflict arrows already invite manual tightening.
//
// Pure function; the caller persists the returned patches.

// All date math here is pure-UTC on YYYY-MM-DD strings. (projectTemplate-
// Schedule's addBusinessDays mixes UTC parsing with local-time day steps,
// which drifts a day for date-only strings depending on timezone — fine for
// its relative template offsets, wrong for exact weekday alignment.)
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDaysISO = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
};
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86_400_000);
// The next Mon–Fri day strictly after `iso`.
const nextBusinessDayISO = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return isoDay(d);
};

// Relaxation until fixpoint: shifts only move dates forward, and the pass
// count is bounded by the task count, so cycles (the picker only blocks
// direct A↔B) terminate instead of looping. skipId (when set) protects the
// just-edited task from being counter-shifted.
function relax(list, eff, skipId) {
  const touched = new Set();
  for (let pass = 0; pass < list.length; pass++) {
    let moved = false;
    for (const t of list) {
      if (skipId && t.id === skipId) continue;
      const deps = t.depends_on ?? [];
      if (deps.length === 0) continue;
      let latestDue = null;
      for (const depId of deps) {
        const p = eff.get(depId);
        if (p?.due && (!latestDue || p.due > latestDue)) latestDue = p.due;
      }
      if (!latestDue) continue;
      const required = nextBusinessDayISO(latestDue);
      const cur = eff.get(t.id);
      if (cur.start && cur.start >= required) continue;

      let nextDue = cur.due;
      if (cur.due != null) {
        if (cur.start && cur.due >= cur.start) {
          nextDue = addDaysISO(required, daysBetween(cur.start, cur.due)); // keep duration
        } else if (cur.due < required) {
          nextDue = required;
        }
      }
      eff.set(t.id, { start: required, due: nextDue });
      touched.add(t.id);
      moved = true;
    }
    if (!moved) break;
  }
  return [...touched].map((id) => {
    const v = eff.get(id);
    return { id, start_date: v.start, ...(v.due != null ? { due_date: v.due } : {}) };
  });
}

// tasks: the project's task rows ({ id, depends_on, start_date, due_date }).
// changedId: the task whose dates just changed; newStart/newDue: its new
// values (pass the unchanged one through). Returns [{ id, start_date,
// due_date? }] for every task that must shift — empty when nothing violates.
export function cascadeDependentDates(tasks, changedId, newStart, newDue) {
  const list = tasks ?? [];
  const eff = new Map(list.map((t) => [t.id, { start: t.start_date ?? null, due: t.due_date ?? null }]));
  if (!eff.has(changedId)) return [];
  eff.set(changedId, { start: newStart ?? null, due: newDue ?? null });
  return relax(list, eff, changedId);
}

// Fix every dependency violation in the list as it stands — used after an
// EDGE changes (a dependency was just created), where no task's dates moved
// but a dependent may now start before its new predecessor finishes.
export function resolveDependencyViolations(tasks) {
  const list = tasks ?? [];
  const eff = new Map(list.map((t) => [t.id, { start: t.start_date ?? null, due: t.due_date ?? null }]));
  return relax(list, eff, null);
}
