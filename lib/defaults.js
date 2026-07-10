export const DEFAULT_INPUTS = {
  propertyName: '',
  propertyAddress: '',
  propertyType: 'hospitality',
  includeWifi: true, // tech visibility: show/quote the Managed Wi-Fi system
  includeCameras: true, // tech visibility: show/quote the Camera system
  includeShipping: true, // add an estimated shipping line to the quote
  shippingPercent: 7, // shipping as a % of hardware (editable; applied when included)
  numberOfRooms: 100,
  numberOfIDFs: 2,
  apToRoomRatio: 2,
  deploymentType: 'hallway',
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
  logo: null, // { dataUrl, w, h }
  primaryColor: '#2563eb', // banners, section bars, table headers, app accent
  accentColor: '#1e40af', // totals / gross-profit highlights
  secondaryColor: '#0891b2', // second gradient stop for sidebar/buttons in "bold" mode
  uiTheme: 'bold', // 'muted' | 'bold' — see components/BrandingVars.jsx
  sidebarStyle: 'gradient', // 'gradient' | 'solid' — bold-mode sidebar fill only
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
