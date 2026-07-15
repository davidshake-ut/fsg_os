import { describe, it, expect } from 'vitest';
import { cascadeDependentDates } from '../lib/taskDependencies';

const task = (id, start, due, deps = []) => ({
  id,
  start_date: start,
  due_date: due,
  depends_on: deps,
});

describe('cascadeDependentDates', () => {
  it('pushes a dependent forward, preserving its duration', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-05'), // Mon–Wed
      task('b', '2026-08-06', '2026-08-07', ['a']), // Thu–Fri, 1-day duration
    ];
    // A slips to finish Friday 8/7 → B must start next business day (Mon 8/10)
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-07');
    expect(out).toEqual([{ id: 'b', start_date: '2026-08-10', due_date: '2026-08-11' }]);
  });

  it('skips weekends for the successor start', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-06'),
      task('b', '2026-08-07', '2026-08-07', ['a']),
    ];
    // A now ends Friday 8/7 → B starts Monday 8/10
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-07');
    expect(out[0].start_date).toBe('2026-08-10');
  });

  it('never pulls a dependent earlier when the predecessor moves back', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-05'),
      task('b', '2026-08-20', '2026-08-21', ['a']), // comfortable slack
    ];
    const out = cascadeDependentDates(tasks, 'a', '2026-08-01', '2026-08-03');
    expect(out).toEqual([]);
  });

  it('cascades through a chain', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-04'),
      task('b', '2026-08-05', '2026-08-06', ['a']),
      task('c', '2026-08-07', '2026-08-10', ['b']),
    ];
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-07'); // a ends Fri
    const byId = Object.fromEntries(out.map((u) => [u.id, u]));
    expect(byId.b.start_date).toBe('2026-08-10'); // Mon
    expect(byId.b.due_date).toBe('2026-08-11');
    expect(byId.c.start_date).toBe('2026-08-12'); // after b's new due
  });

  it('honors the LATEST of multiple predecessors', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-04'),
      task('x', '2026-08-03', '2026-08-12'), // finishes later, unchanged
      task('b', '2026-08-13', '2026-08-14', ['a', 'x']),
    ];
    // a slips to 8/10 — but x already requires b to start 8/13; no shift
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-10');
    expect(out).toEqual([]);
  });

  it('terminates on dependency cycles instead of looping', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-04', ['c']),
      task('b', '2026-08-05', '2026-08-06', ['a']),
      task('c', '2026-08-07', '2026-08-10', ['b']),
    ];
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-11');
    expect(Array.isArray(out)).toBe(true); // bounded relaxation, no hang
  });

  it('tolerates dependents with missing dates', () => {
    const tasks = [
      task('a', '2026-08-03', '2026-08-05'),
      task('b', null, null, ['a']),
      task('c', null, '2026-08-04', ['a']),
    ];
    const out = cascadeDependentDates(tasks, 'a', '2026-08-03', '2026-08-07');
    const byId = Object.fromEntries(out.map((u) => [u.id, u]));
    expect(byId.b.start_date).toBe('2026-08-10');
    expect(byId.b.due_date).toBeUndefined();
    expect(byId.c.due_date).toBe('2026-08-10'); // due bumped to the new start
  });
});
