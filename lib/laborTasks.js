// Labor task table — complex-project Builder, Phase 5. The hours behind the
// proposal's rate card come from a table of tasks instead of formulas baked
// into code: each task is `hours` per unit of a `driver` (APs, switches by
// class, closets, drops, cameras…) or a flat block, credited to a rate-card
// role, gated on which systems the quote has. The default table reproduces
// the estimates the app has always made (lib/estimateLaborHours.js), so
// existing quotes are unchanged; a team edits its own copy at
// companies.settings.laborTasks or starts from a preset.

export const LABOR_DRIVERS = {
  flat: 'Flat (× quantity)',
  aps: 'Access points',
  switches: 'Edge switches (all)',
  switches8: '8-port switches',
  switches24: '24-port switches',
  switches48: '48-port switches',
  idfs: 'Telecom rooms (IDFs)',
  units: 'Units',
  wiredDrops: 'Wired drops',
  b2b: 'Building-to-building links',
  cameras: 'Cameras',
  nvrs: 'NVRs',
  aiLicenses: 'AI camera licenses',
};

// Gates: 'any' = a Wi-Fi or camera design is present; 'wifi'; 'camera';
// 'ai' = AI licenses > 0.
export const LABOR_GATES = ['any', 'wifi', 'camera', 'ai'];

const t = (key, label, role, hours, driver, when = 'any', qty = 1) => ({ key, label, role, hours, driver, when, qty });

// Today's heuristics as a table — the order within a role mirrors the
// original formulas so floating-point sums (and the ceil after them) are
// identical.
export const DEFAULT_LABOR_TASKS = [
  // Installation Technician: mount + cable + rack + NVR install
  t('it-ap', 'AP mount & cable', 'install-tech', 0.5, 'aps'),
  t('it-switch', 'Switch install', 'install-tech', 1, 'switches'),
  t('it-idf', 'Telecom room build-out', 'install-tech', 2, 'idfs'),
  t('it-drop', 'Wired drop', 'install-tech', 0.4, 'wiredDrops'),
  t('it-b2b', 'Building-to-building link', 'install-tech', 3, 'b2b'),
  t('it-camera', 'Camera mount & aim', 'install-tech', 0.75, 'cameras'),
  t('it-nvr', 'NVR install', 'install-tech', 1, 'nvrs'),
  // Network Engineer: configuration & tuning
  t('ne-wifi-base', 'Wi-Fi network baseline config', 'network-engineer', 4, 'flat', 'wifi'),
  t('ne-switch', 'Switch configuration', 'network-engineer', 0.75, 'switches'),
  t('ne-ap', 'AP provisioning & tuning', 'network-engineer', 0.1, 'aps'),
  t('ne-b2b', 'Building link configuration', 'network-engineer', 1, 'b2b'),
  t('ne-nvr', 'NVR configuration', 'network-engineer', 2, 'nvrs'),
  t('ne-camera', 'Camera onboarding', 'network-engineer', 0.15, 'cameras'),
  t('ne-ai-base', 'AI analytics setup', 'network-engineer', 2, 'flat', 'ai'),
  t('ne-ai-lic', 'AI license configuration', 'network-engineer', 0.1, 'aiLicenses', 'ai'),
  // System Designer: site planning, placement, BOM
  t('sd-wifi-base', 'Wi-Fi site planning', 'system-designer', 4, 'flat', 'wifi'),
  t('sd-ap', 'AP placement', 'system-designer', 0.15, 'aps'),
  t('sd-idf', 'Telecom room design', 'system-designer', 0.5, 'idfs'),
  t('sd-camera-base', 'Camera site planning', 'system-designer', 3, 'flat', 'camera'),
  t('sd-camera', 'Camera placement', 'system-designer', 0.1, 'cameras'),
  // Project Manager: coordination, scheduling, oversight
  t('pm-base', 'Project coordination baseline', 'project-manager', 6, 'flat'),
  t('pm-ap', 'Per-AP coordination', 'project-manager', 0.05, 'aps'),
  t('pm-camera', 'Per-camera coordination', 'project-manager', 0.05, 'cameras'),
  t('pm-idf', 'Per-room coordination', 'project-manager', 1, 'idfs'),
  t('pm-switch', 'Per-switch coordination', 'project-manager', 0.25, 'switches'),
  t('pm-nvr', 'Per-NVR coordination', 'project-manager', 0.5, 'nvrs'),
  // Admin: procurement, finance, IT overhead
  t('ad-base', 'Procurement & finance baseline', 'admin-overhead', 3, 'flat'),
  t('ad-ap', 'Per-AP paperwork', 'admin-overhead', 0.03, 'aps'),
  t('ad-camera', 'Per-camera paperwork', 'admin-overhead', 0.03, 'cameras'),
  t('ad-switch', 'Per-switch paperwork', 'admin-overhead', 0.03, 'switches'),
  t('ad-nvr', 'Per-NVR paperwork', 'admin-overhead', 0.03, 'nvrs'),
];

// The multifamily takeoff table (SKBM Muze Apartments, Aug 2026): install
// by switch class, flat project management / configuration / design
// blocks. Telecom-room kits and media panels bring their own hours from
// Digital Infrastructure, so they are not repeated here.
export const MULTIFAMILY_TAKEOFF_TASKS = [
  t('mf-ap', 'AP install', 'install-tech', 0.5, 'aps'),
  t('mf-sw8', '8-port switch install', 'install-tech', 2, 'switches8'),
  t('mf-sw24', '24-port switch install', 'install-tech', 4, 'switches24'),
  t('mf-sw48', '48-port switch install', 'install-tech', 8, 'switches48'),
  t('mf-th-rack', 'Townhome rack build (× count)', 'install-tech', 12, 'flat', 'any', 0),
  t('mf-pm', 'Project management', 'project-manager', 400, 'flat'),
  t('mf-config', 'Network configuration', 'network-engineer', 90, 'flat'),
  t('mf-design', 'Network design & engineering', 'network-engineer', 40, 'flat'),
];

export const LABOR_TASK_PRESETS = {
  default: { label: 'Standard (hospitality)', tasks: DEFAULT_LABOR_TASKS },
  multifamily: { label: 'Multifamily takeoff', tasks: MULTIFAMILY_TAKEOFF_TASKS },
};

const n0 = (v) => Math.max(0, Number(v) || 0);

// Settings sanitizer: returns a clean task list, or null when nothing usable
// (callers then fall back to DEFAULT_LABOR_TASKS).
export function normalizeLaborTasks(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const role = String(x.role ?? '').trim();
    const driver = Object.prototype.hasOwnProperty.call(LABOR_DRIVERS, x.driver) ? x.driver : null;
    if (!role || !driver) continue;
    out.push({
      key: String(x.key ?? '').trim() || `task_${out.length + 1}`,
      label: String(x.label ?? '').trim() || LABOR_DRIVERS[driver],
      role,
      hours: n0(x.hours),
      driver,
      when: LABOR_GATES.includes(x.when) ? x.when : 'any',
      qty: driver === 'flat' ? n0(x.qty ?? 1) : 1,
    });
  }
  return out.length ? out : null;
}

// Hours per role from a task table and the design metrics
// ({ aps, switches, switches8, switches24, switches48, idfs, units,
//   wiredDrops, b2b, cameras, nvrs, aiLicenses, wifi, camera, any, ai }).
export function hoursFromTasks(tasks, metrics) {
  const hours = {};
  for (const task of tasks ?? []) {
    if (!metrics[task.when]) continue;
    const units = task.driver === 'flat' ? task.qty : Number(metrics[task.driver]) || 0;
    if (units <= 0) continue;
    hours[task.role] = (hours[task.role] ?? 0) + task.hours * units;
  }
  return hours;
}
