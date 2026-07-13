// Tiny external store bridging the Builder's per-quote technology toggles to
// the Sidebar sub-nav (which lives outside the Builder's component tree).
// The Builder publishes its enabled tech ids whenever they change; the
// Sidebar subscribes and lists only those. Before the Builder has published
// (fresh session, other pages), consumers fall back to the default-on pair.

const FALLBACK = { enabledIds: null };

let snapshot = FALLBACK;
const listeners = new Set();

export function publishBuilderTechs(enabledIds) {
  const next = Array.isArray(enabledIds) ? [...enabledIds] : null;
  const prev = snapshot.enabledIds;
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  snapshot = { enabledIds: next };
  listeners.forEach((cb) => cb());
}

export function subscribeBuilderTechs(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getBuilderTechsSnapshot() {
  return snapshot;
}

export function getBuilderTechsServerSnapshot() {
  return FALLBACK;
}
