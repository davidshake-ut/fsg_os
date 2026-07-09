// Pure scheduling logic shared between the project-detail "Apply Template"
// flow (hooks/usePSAProject.js) and the System Builder's "→ Project" auto-
// generation — both need the same "phase N+1 starts after phase N ends,
// task N+1 starts after task N ends" business-day math, just from different
// call sites (one hook-scoped, one not).

// Add N business days (Mon-Fri) to a date.
export function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

// Given a template's phases ([{ name, tasks: [{ name, description, duration_days, role, order }] }])
// and an optional start date, compute ready-to-insert milestone/task records
// (no ids, no project/technology scoping — the caller adds those).
export function computeTemplateSchedule(phases, startDate) {
  let globalOffset = 0; // running business-day offset from startDate
  const base = startDate ? new Date(startDate) : null;
  const isoDay = (d) => d.toISOString().slice(0, 10);

  return (phases ?? []).map((phase, phaseIndex) => {
    const phaseStartOffset = globalOffset;
    let taskOffset = globalOffset;
    const taskSpans = (phase.tasks ?? []).map((t) => {
      const days = Number(t.duration_days ?? 1);
      const span = { start: taskOffset, end: taskOffset + days };
      taskOffset += days;
      return span;
    });
    const phaseEndOffset = taskOffset;
    globalOffset = phaseEndOffset;

    const tasks = (phase.tasks ?? []).map((templateTask, i) => {
      const span = taskSpans[i];
      return {
        title: templateTask.name,
        description: templateTask.description ?? null,
        role: templateTask.role ?? null,
        estimated_hours: Number(templateTask.duration_days ?? 1) * 8,
        sort_order: (templateTask.order ?? templateTask.order_index ?? i) * 10,
        start_date: base ? isoDay(addBusinessDays(new Date(base), span.start)) : null,
        due_date: base ? isoDay(addBusinessDays(new Date(base), span.end)) : null,
      };
    });

    return {
      name: phase.name,
      sort_order: phaseIndex * 10,
      start_date: base ? isoDay(addBusinessDays(new Date(base), phaseStartOffset)) : null,
      due_date: base ? isoDay(addBusinessDays(new Date(base), phaseEndOffset)) : null,
      tasks,
    };
  });
}
