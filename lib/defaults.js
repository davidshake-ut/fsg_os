export const DEFAULT_INPUTS = {
  propertyName: '',
  propertyAddress: '',
  propertyType: 'hospitality',
  includeWifi: true, // legacy tech toggle (mirrored from technologies.managed_wifi)
  includeCameras: true, // legacy tech toggle (mirrored from technologies.video_surveillance)
  // Per-technology enablement, keyed by lib/technologies.js ids. null means
  // "derive from the legacy toggles above" (pre-Tier-1 quotes).
  technologies: null,
  // Tier-2 mini-calculator design inputs, keyed by technology id (see
  // components/builder/calculators). Rides the quote's inputs jsonb, so
  // save/load/revisions carry it with no schema change.
  techCalc: {},
  includeShipping: true, // add an estimated shipping line to the quote
  shippingPercent: 7, // shipping as a % of hardware (editable; applied when included)
  numberOfRooms: 100,
  numberOfIDFs: 2,
  apToRoomRatio: 2,
  deploymentType: 'ceiling', // 'ceiling' | 'wall' (legacy saved quotes: 'hallway' | 'inroom')
  wifiQuality: 'better', // 'better' | 'best' — tag-based equipment selection (0061)
  licenseTerm: 5, // 1 | 3 | 5 year — which linked license SKU ships with tagged gear
  guestRoomWiredConnections: 0,
  meetingRooms: 0,
  publicAreaAPs: 0,
  bohAPs: 0,
  outdoorAPs: 0,
  businessCenterWired: 0,
  idfRacksNeeded: true,
  spareAPs: false,
  spareSwitches: false,
  cat6Required: false,
  cat6Drops: 0,
  gatewayModel: 'NSE3000',
  aggSwitchType: 'fiber',
  wifiGeneration: 'wifi6',
  miscHwPercent: 0,
  b2bConnectionType: 'none',
  b2bConnectionQty: 1,
};

// Company branding — applied to the app header, CSV/PDF exports, and (via
// components/BrandingVars.jsx) the whole app's CSS custom properties.
// Team mode: one row per company (companies table, migrations 0004/0033/0034).
// Local mode: stored in localStorage (one brand per install).
export const DEFAULT_BRANDING = {
  companyName: '',
  logo: null, // { dataUrl, w, h } — dark artwork, used on light backgrounds
  logoLight: null, // { dataUrl, w, h } — light artwork, used on dark backgrounds
  primaryColor: '#2563eb', // banners, section bars, table headers, app accent
  accentColor: '#1e40af', // totals / gross-profit highlights
  secondaryColor: '#0891b2', // second gradient stop for sidebar/buttons in "bold" mode
  backgroundColor: '#f6f7f9', // app page background (--ui-page-bg)
  uiTheme: 'bold', // 'muted' | 'bold' — see components/BrandingVars.jsx
  sidebarStyle: 'gradient', // 'gradient' | 'solid' — bold-mode sidebar fill only
  accentStyle: 'gradient', // 'gradient' | 'solid' — bold-mode buttons & accent fills (--ui-button-bg)
};

// Professional-labor rate card — drives ALL labor on the quote (it replaces the
// old hardcoded auto-generated services). One project-wide set of roles, each
// with an internal cost rate and a client bill rate. Rates are $/hr; line cost =
// costRate × hours, line price = billRate × hours.
//
// `hours: null` means "use the live design-based estimate" (see
// lib/estimateLaborHours.js); a number overrides the estimate for that role.
// Fully editable per project on the Services tab; persisted with the project.
export const DEFAULT_LABOR_ROLES = [
  { key: 'install-tech', label: 'Installation Technician', costRate: 75, billRate: 125, hours: null },
  { key: 'project-manager', label: 'Project Manager', costRate: 110, billRate: 175, hours: null },
  { key: 'network-engineer', label: 'Network Engineer', costRate: 130, billRate: 200, hours: null },
  { key: 'system-designer', label: 'System Designer', costRate: 120, billRate: 190, hours: null },
  {
    key: 'admin-overhead',
    label: 'Admin (Procurement, Finance, IT)',
    costRate: 65,
    billRate: 110,
    hours: null,
  },
];

// Camera-systems calculator inputs (separate BOM from the Wi-Fi one).
export const DEFAULT_CAMERA_INPUTS = {
  cam4mpBullet: 0,
  cam4mpTurret: 0,
  cam8mpBullet: 0,
  cam8mpTurret: 0,
  aiLicenses: 0, // Alpha Vision AI camera licenses (user-entered; independent of camera count)
  retention: 'month', // 'week' (2TB HDD) | 'month' (8TB HDD)
  spareCameras: false,
};
