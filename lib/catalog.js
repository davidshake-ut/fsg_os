// Base product catalog — ground truth for all products.
// Embedded in the frontend; the `custom_products` table only holds overrides
// and additions on top of this list (see lib/mergeProducts.js).

const RAW_BASE_PRODUCTS = [
  // === GATEWAYS ===
  { sku: 'NSE3000', desc: 'Cambium NSE3000 Network Services Engine (Gateway/Router)', cost: 1295.0, price: 1750.0, category: 'Gateway', vendor: 'Cambium Networks' },
  { sku: 'NSE4000', desc: 'Cambium NSE4000 Network Services Engine (Gateway/Router)', cost: 2495.0, price: 3200.0, category: 'Gateway', vendor: 'Cambium Networks' },

  // === UPS ===
  { sku: 'PSI5-1500RT120', desc: 'Liebert UPS Vertiv PSI5 1500 1350W 120VAC Rack/Tower', cost: 779.99, price: 948.0, category: 'UPS', vendor: 'Vertiv' },

  // === ACCESS POINTS — Wi-Fi 6 ===
  { sku: 'XV2-21X', desc: 'Cambium XV2-21X WiFi 6 2x2 Indoor Ceiling AP (1Gb)', cost: 98.94, price: 149.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV2-22H', desc: 'Cambium XV2-22H WiFi 6 Wallplate AP 2x2 Indoor (1Gb)', cost: 99.92, price: 149.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV2-2X', desc: 'Cambium XV2-2X WiFi 6 2x2 Indoor AP (2.5Gb) — Meeting/Public', cost: 222.68, price: 295.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV2-23T', desc: 'Cambium XV2-23T WiFi 6 2x2 Outdoor AP (1Gb)', cost: 248.05, price: 325.0, category: 'Access Point', vendor: 'Cambium Networks' },

  // === ACCESS POINTS — Wi-Fi 7 ===
  { sku: 'XV3-21X', desc: 'Cambium XV3-21X WiFi 7 2x2 Indoor Ceiling AP (2.5Gb)', cost: 178.0, price: 249.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV3-22H', desc: 'Cambium XV3-22H WiFi 7 Wallplate AP 2x2 Indoor (2.5Gb)', cost: 189.0, price: 265.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV3-2X', desc: 'Cambium XV3-2X WiFi 7 4x4 Indoor AP (2.5Gb) — Meeting/Public', cost: 345.0, price: 459.0, category: 'Access Point', vendor: 'Cambium Networks' },
  { sku: 'XV3-23T', desc: 'Cambium XV3-23T WiFi 7 2x2 Outdoor AP (2.5Gb)', cost: 378.0, price: 499.0, category: 'Access Point', vendor: 'Cambium Networks' },

  // === MOUNTING ===
  { sku: 'PL-WALLMNTB-WW', desc: '430H/425 Mounting Adapter for Wallplate AP (flush surface)', cost: 17.1, price: 28.0, category: 'Mounting', vendor: 'Cambium Networks' },

  // === SUBSCRIPTIONS — AP (5-year cnMaestro X) ===
  { sku: 'MSX-SUB-XV2-21X-5', desc: 'cnMaestro X 5-yr Sub — XV2-21X Indoor AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV2-22H-5', desc: 'cnMaestro X 5-yr Sub — XV2-22H Wallplate AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV2-2X-5', desc: 'cnMaestro X 5-yr Sub — XV2-2X Indoor 2.5Gb AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV2-23T-5', desc: 'cnMaestro X 5-yr Sub — XV2-23T Outdoor AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV3-21X-5', desc: 'cnMaestro X 5-yr Sub — XV3-21X WiFi 7 Indoor AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV3-22H-5', desc: 'cnMaestro X 5-yr Sub — XV3-22H WiFi 7 Wallplate AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV3-2X-5', desc: 'cnMaestro X 5-yr Sub — XV3-2X WiFi 7 Indoor 2.5Gb AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-XV3-23T-5', desc: 'cnMaestro X 5-yr Sub — XV3-23T WiFi 7 Outdoor AP', cost: 54.75, price: 75.0, category: 'Subscription', vendor: 'Cambium Networks' },

  // === SUBSCRIPTIONS — SWITCHES ===
  { sku: 'MSX-SUB-EX2028-P-5', desc: 'cnMaestro X 5-yr Sub — EX2028-P Switch', cost: 59.4, price: 85.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-EX2052-P-5', desc: 'cnMaestro X 5-yr Sub — EX2052-P Switch', cost: 84.15, price: 115.0, category: 'Subscription', vendor: 'Cambium Networks' },
  { sku: 'MSX-SUB-EX3024F-5', desc: 'cnMaestro X 5-yr Sub — EX3024F Aggregate Switch', cost: 118.8, price: 160.0, category: 'Subscription', vendor: 'Cambium Networks' },

  // === SWITCHES ===
  { sku: 'MX-EX2028PxA-U', desc: 'Cambium cnMatrix EX2028-P 24-Port PoE+ 4SFP+ 400W', cost: 664.76, price: 895.0, category: 'Switch', vendor: 'Cambium Networks' },
  { sku: 'MXEX2052GxPA01', desc: 'Cambium cnMatrix EX2052-P 48-Port PoE+ 4SFP+ 540W', cost: 1014.55, price: 1350.0, category: 'Switch', vendor: 'Cambium Networks' },

  // === AGGREGATE SWITCH ===
  { sku: 'MXEX3024xFxA01', desc: 'Cambium cnMatrix EX3024F 24-Port 10Gb SFP+ Fiber Aggregate Switch', cost: 1898.1, price: 2495.0, category: 'Aggregate Switch', vendor: 'Cambium Networks' },

  // === FIBER MODULES ===
  { sku: 'SFP-10G-SR', desc: 'Cambium 10G SFP+ MMF SR Transceiver 850nm (300m)', cost: 51.79, price: 75.0, category: 'Fiber Module', vendor: 'Cambium Networks' },
  { sku: 'SFP-1G-SX', desc: 'Cambium 1G SFP MMF SX Transceiver 850nm', cost: 31.06, price: 48.0, category: 'Fiber Module', vendor: 'Cambium Networks' },

  // === CABLES ===
  { sku: 'GS-LC2-05-10G', desc: 'OM4 Duplex OFNR LC-LC 5M Fiber Patch Cable', cost: 6.24, price: 12.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-3ft-RED', desc: "CAT6 Patch Cable 3' Red — Gateway connections", cost: 1.69, price: 3.5, category: 'Cable', vendor: '' },
  { sku: 'CAT6-5ft-BLUE', desc: "CAT6 Patch Cable 5' Blue — Uplink", cost: 2.16, price: 4.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-1ft-PURPLE', desc: "CAT6 Patch Cable 1' Purple — Guest Internet", cost: 0.86, price: 2.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-3ft-PURPLE', desc: "CAT6 Patch Cable 3' Purple — Guest Internet", cost: 1.16, price: 2.5, category: 'Cable', vendor: '' },
  { sku: 'CAT6-5ft-PURPLE', desc: "CAT6 Patch Cable 5' Purple — Guest Internet", cost: 1.48, price: 3.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-15ft-BLACK', desc: "CAT6 Patch Cable 15' Black — End Device/AP", cost: 4.77, price: 8.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-3in-BLACK', desc: 'CAT6 3" Cable (No Boot) Black — Wallplate AP', cost: 2.01, price: 4.0, category: 'Cable', vendor: '' },
  { sku: 'CAT6-DROP', desc: 'CAT6 Ethernet Cabling Drop (per drop, installed)', cost: 175.0, price: 225.0, category: 'Cabling', vendor: '' },

  // === RACKS ===
  { sku: 'RR1907-BK1', desc: "Middle Atlantic 7' Full Height 19\" Rack", cost: 144.15, price: 220.0, category: 'Rack', vendor: 'Bright Metal Solutions' },
  { sku: 'SPM-4', desc: 'Wall Mount Rack 4U Sideways', cost: 97.19, price: 165.0, category: 'Rack', vendor: 'Middle Atlantic' },

  // === RACK ACCESSORIES ===
  { sku: 'RS-1215', desc: 'Tripplite Power Strip 15A 12-Outlet 19" Rackmount', cost: 108.8, price: 122.0, category: 'Rack Accessory', vendor: 'Tripp Lite' },
  { sku: 'W-75-MRL-BK', desc: '3/4" Rip-Tie Wrap Strap 75ft Roll Black', cost: 32.43, price: 50.0, category: 'Rack Accessory', vendor: '' },

  // === BUILDING-TO-BUILDING ===
  { sku: 'B2B-FIBER', desc: 'Building-to-Building Connection — Fiber (per link)', cost: 2000.0, price: 3000.0, category: 'Cabling', vendor: '' },
  { sku: 'B2B-COPPER', desc: 'Building-to-Building Connection — Copper (per link)', cost: 300.0, price: 500.0, category: 'Cabling', vendor: '' },
  { sku: 'B2B-WIRELESS', desc: 'Building-to-Building Connection — Wireless (per link)', cost: 900.0, price: 1500.0, category: 'Cabling', vendor: '' },

  // === MISC HARDWARE ===
  { sku: 'MISC-HW', desc: 'Miscellaneous Hardware Components', cost: 500.0, price: 650.0, category: 'Miscellaneous', vendor: '' },

  // === CAMERAS — 4MP (1080p-class) ===  cost = dealer, price = MSRP
  { sku: 'IPC2124SR-ADF28KM-H', desc: 'Uniview 4MP Fixed Bullet IP Camera (2.8mm)', cost: 119.0, price: 174.0, category: 'Camera', vendor: 'Uniview' },
  { sku: 'IPC3614SR-ADF28KM-H', desc: 'Uniview 4MP Fixed Turret IP Camera (2.8mm)', cost: 119.0, price: 279.0, category: 'Camera', vendor: 'Uniview' },

  // === CAMERAS — 8MP (4K) ===
  { sku: 'IPC3638SS-ADF28KMC-I1', desc: 'Uniview 8MP 4K Fixed Turret IP Camera (2.8mm)', cost: 272.0, price: 529.0, category: 'Camera', vendor: 'Uniview' },
  { sku: 'IPC2B18SS-ADF28KMC-I1', desc: 'Uniview 8MP 4K Fixed Bullet IP Camera (2.8mm)', cost: 272.0, price: 449.0, category: 'Camera', vendor: 'Uniview' },

  // === NVR (8-channel PoE) ===
  { sku: 'NVR501-08B-LP8', desc: 'Uniview 8-Channel PoE NVR (NVR501-08B-LP8)', cost: 190.0, price: 300.0, category: 'NVR', vendor: 'Uniview' },

  // === SURVEILLANCE STORAGE (HDD) ===
  { sku: 'WD23PURZ', desc: 'WD Purple 2TB Surveillance HDD (~1 week, 8 cameras)', cost: 82.0, price: 155.0, category: 'Storage', vendor: 'Western Digital' },
  { sku: 'WD85PURZ', desc: 'WD Purple 8TB Surveillance HDD (~1 month, 8 cameras)', cost: 236.0, price: 260.0, category: 'Storage', vendor: 'Western Digital' },

  // === CAMERA SOFTWARE / LICENSING ===
  { sku: 'AV-AI-LIC', desc: 'Alpha Vision AI Camera License', cost: 99.0, price: 149.0, category: 'License', vendor: '' },
];

// Technology (lib/technologies.js id) is derived from the part type for the
// legacy base catalog — camera-world parts are Video Surveillance, the rest
// Managed Wi-Fi. New products carry an explicit technology instead.
const CAMERA_WORLD = new Set(['Camera', 'NVR', 'Storage', 'License']);
export const BASE_PRODUCTS = RAW_BASE_PRODUCTS.map((p) => ({
  ...p,
  technology: CAMERA_WORLD.has(p.category) ? 'video_surveillance' : 'managed_wifi',
}));

export const CATEGORY_ORDER = [
  'Gateway', 'UPS', 'Access Point', 'Mounting', 'Subscription',
  'Aggregate Switch', 'Switch', 'Fiber Module', 'Cable', 'Rack',
  'Rack Accessory', 'Miscellaneous', 'Cabling', 'Software',
  // Camera systems
  'Camera', 'NVR', 'Storage', 'License',
];

// Part types — the UI now labels this dimension "Subcategory" (the
// "Category" label belongs to the technology, lib/technologies.js).
// 'Service' marks labor/service SKUs that render in each technology
// page's Services sub-group.
export const PRODUCT_CATEGORIES = [
  'Gateway', 'UPS', 'Access Point', 'Mounting', 'Subscription',
  'Switch', 'Aggregate Switch', 'Fiber Module', 'Cable', 'Cabling',
  'Rack', 'Rack Accessory', 'Miscellaneous', 'Software',
  'Camera', 'NVR', 'Storage', 'License',
  'Smart Device', 'Door Controller', 'EV Charger', 'Service',
];

// Every SKU the BOM engine may reference via addItem(). Soft-deleting any of
// these from the catalog would break calculation, so the catalog UI must block
// their deletion (see lib/mergeProducts.js + the products API role guard).
export const CORE_SKUS = new Set([
  'NSE3000', 'NSE4000', 'PSI5-1500RT120',
  'XV2-21X', 'XV2-22H', 'XV2-2X', 'XV2-23T',
  'XV3-21X', 'XV3-22H', 'XV3-2X', 'XV3-23T',
  'PL-WALLMNTB-WW',
  'MSX-SUB-XV2-21X-5', 'MSX-SUB-XV2-22H-5', 'MSX-SUB-XV2-2X-5', 'MSX-SUB-XV2-23T-5',
  'MSX-SUB-XV3-21X-5', 'MSX-SUB-XV3-22H-5', 'MSX-SUB-XV3-2X-5', 'MSX-SUB-XV3-23T-5',
  'MSX-SUB-EX2028-P-5', 'MSX-SUB-EX2052-P-5', 'MSX-SUB-EX3024F-5',
  'MX-EX2028PxA-U', 'MXEX2052GxPA01', 'MXEX3024xFxA01',
  'SFP-10G-SR', 'SFP-1G-SX', 'GS-LC2-05-10G',
  'CAT6-3ft-RED', 'CAT6-5ft-BLUE', 'CAT6-1ft-PURPLE', 'CAT6-3ft-PURPLE',
  'CAT6-5ft-PURPLE', 'CAT6-15ft-BLACK', 'CAT6-3in-BLACK', 'CAT6-DROP',
  'RR1907-BK1', 'RS-1215', 'W-75-MRL-BK',
  'B2B-FIBER', 'B2B-COPPER', 'B2B-WIRELESS',
  'MISC-HW',
  // Camera-system SKUs the camera BOM engine depends on.
  'IPC2124SR-ADF28KM-H', 'IPC3614SR-ADF28KM-H',
  'IPC3638SS-ADF28KMC-I1', 'IPC2B18SS-ADF28KMC-I1',
  'NVR501-08B-LP8', 'WD23PURZ', 'WD85PURZ', 'AV-AI-LIC',
]);
