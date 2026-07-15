// Tiny external store bridging the Builder's state to the Sidebar sub-nav
// (which lives outside the Builder's component tree). The Builder publishes
// its enabled tech ids (the sub-links to list) and its active level-1 tab
// (so the matching sub-link highlights instead of the parent). Before the
// Builder has published (fresh session, other pages), consumers fall back
// to the default-on pair and no active tab.

const FALLBACK = { enabledIds: null, activeTab: null };

let snapshot = FALLBACK;
const listeners = new Set();

export function publishBuilderTechs(enabledIds) {
  const next = Array.isArray(enabledIds) ? [...enabledIds] : null;
  const prev = snapshot.enabledIds;
  if (JSON.stringify(prev) === JSON.stringify(next)) return;
  snapshot = { ...snapshot, enabledIds: next };
  listeners.forEach((cb) => cb());
}

export function publishBuilderActiveTab(activeTab) {
  const next = activeTab ?? null;
  if (snapshot.activeTab === next) return;
  snapshot = { ...snapshot, activeTab: next };
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
