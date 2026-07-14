// Camera-systems BOM engine — a PURE function, mirroring lib/calculateBOM.js.
// Sizing rules (from the supplied product data):
//   - 1 camera line per selected model (cost = dealer, price = MSRP).
//   - 1 NVR (NVR501-08B-LP8, 8 channels) per 8 cameras.
//   - 1 surveillance HDD per NVR, sized by retention:
//       'week'  -> WD23PURZ 2TB   (~1 week,  8 cameras)
//       'month' -> WD85PURZ 8TB   (~1 month, 8 cameras)
//   - 7% estimated shipping on hardware (matches the Wi-Fi BOM).
// Output shape matches calculateBOM so it can reuse BOMTable / exports.

import { toCustomLine } from './customLine';

const CAM_4MP_BULLET = 'IPC2124SR-ADF28KM-H';
const CAM_4MP_TURRET = 'IPC3614SR-ADF28KM-H';
const CAM_8MP_TURRET = 'IPC3638SS-ADF28KMC-I1';
const CAM_8MP_BULLET = 'IPC2B18SS-ADF28KMC-I1';
const NVR_SKU = 'NVR501-08B-LP8';
const HDD_WEEK = 'WD23PURZ'; // 2TB
const HDD_MONTH = 'WD85PURZ'; // 8TB
const NVR_CHANNELS = 8;

export function calculateCameraBOM(
  cameraInputs = {},
  priceOverrides = {},
  serviceOverrides = {},
  allProducts = [],
  customItems = [],
  shipping = {}
) {
  const items = [];
  const serviceItems = [];

  const {
    cam4mpBullet = 0,
    cam4mpTurret = 0,
    cam8mpBullet = 0,
    cam8mpTurret = 0,
    aiLicenses = 0,
    retention = 'month',
    spareCameras = false,
  } = cameraInputs;

  // A locked quote (sent/accepted/declined) passes its own frozen
  // catalogSnapshot (via shipping.catalogSnapshot) so a later catalog/discount
  // change never silently reprices it — only drafts/revisions read live data.
  function getProduct(sku) {
    const base = shipping.catalogSnapshot?.[sku] ?? allProducts.find((p) => p.sku === sku);
    if (!base) return null;
    const override = priceOverrides[sku];
    return {
      ...base,
      cost: override?.cost ?? base.cost,
      price: override?.price ?? base.price,
    };
  }

  function addItem(sku, qty, note = '') {
    if (qty <= 0) return;
    const p = getProduct(sku);
    if (!p) {
      if (typeof console !== 'undefined') {
        console.warn(`[calculateCameraBOM] product not found, skipping line: ${sku}`);
      }
      return;
    }
    items.push({
      sku: p.sku,
      description: p.desc,
      qty,
      unitCost: p.cost,
      unitPrice: p.price,
      totalCost: p.cost * qty,
      totalPrice: p.price * qty,
      total: p.price * qty,
      margin: p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0,
      category: p.category,
      note,
    });
  }

  const n4b = Math.max(0, Number(cam4mpBullet) || 0);
  const n4t = Math.max(0, Number(cam4mpTurret) || 0);
  const n8b = Math.max(0, Number(cam8mpBullet) || 0);
  const n8t = Math.max(0, Number(cam8mpTurret) || 0);

  // --- Cameras ---
  addItem(CAM_4MP_BULLET, n4b, '4MP Fixed Bullet');
  addItem(CAM_4MP_TURRET, n4t, '4MP Fixed Turret');
  addItem(CAM_8MP_BULLET, n8b, '8MP 4K Fixed Bullet');
  addItem(CAM_8MP_TURRET, n8t, '8MP 4K Fixed Turret');

  const totalCameras = n4b + n4t + n8b + n8t;

  // --- Spare cameras (5%, NOT counted toward channel sizing) ---
  if (spareCameras && totalCameras > 0) {
    // Spare the most-used model (defaults to the first selected).
    const counts = [
      [CAM_4MP_BULLET, n4b],
      [CAM_4MP_TURRET, n4t],
      [CAM_8MP_BULLET, n8b],
      [CAM_8MP_TURRET, n8t],
    ].sort((a, b) => b[1] - a[1]);
    const [spareSku] = counts[0];
    addItem(spareSku, Math.max(1, Math.ceil(totalCameras * 0.05)), 'Spare cameras (5%)');
  }

  // --- NVRs: one 8-channel recorder per 8 cameras ---
  const nvrCount = Math.ceil(totalCameras / NVR_CHANNELS);
  if (nvrCount > 0) {
    addItem(NVR_SKU, nvrCount, `8-channel PoE NVR (1 per ${NVR_CHANNELS} cameras)`);

    // --- Storage: one HDD per NVR, sized by retention ---
    const isWeek = retention === 'week';
    addItem(
      isWeek ? HDD_WEEK : HDD_MONTH,
      nvrCount,
      isWeek ? '~1 week retention (2TB, 8 cameras)' : '~1 month retention (8TB, 8 cameras)'
    );
  }

  // --- AI camera licenses (user-entered; independent of the camera count) ---
  const aiLicenseQty = Math.max(0, Number(aiLicenses) || 0);
  addItem('AV-AI-LIC', aiLicenseQty, 'Alpha Vision AI analytics license');

  // --- Professional services -------------------------------------------------
  // Camera labor is no longer generated here. All professional labor is driven
  // by the project-wide rate card (see lib/calculateLabor.js), so this engine
  // emits hardware only and serviceItems stays empty. The `serviceOverrides`
  // parameter is a legacy slot and is ignored (kept so positional call sites
  // stay valid; the app no longer stores service overrides).

  // --- Custom line items (user-added, per-project; not in the catalog) ---
  for (const c of customItems) items.push(toCustomLine(c));

  // --- Financial totals (hardware + shipping; labor is project-wide) ---
  // Shipping is a project-level setting (toggle + editable %, default 7%),
  // passed in from the inputs. Defaults preserve the legacy 7% behavior.
  const { includeShipping = true, shippingPercent = 7 } = shipping;
  const shipPct = includeShipping ? Math.max(0, Number(shippingPercent) || 0) : 0;
  const shipFactor = shipPct / 100;

  const totalHardwareCost = items.reduce((s, i) => s + i.totalCost, 0);
  const totalHardwarePrice = items.reduce((s, i) => s + i.totalPrice, 0);
  const totalServicesCost = serviceItems.reduce((s, i) => s + i.totalCost, 0);
  const totalServicesPrice = serviceItems.reduce((s, i) => s + i.totalPrice, 0);
  const shippingCost = totalHardwareCost * shipFactor;
  const shippingPrice = totalHardwarePrice * shipFactor;
  const grandTotalCost = totalHardwareCost + totalServicesCost + shippingCost;
  const grandTotalPrice = totalHardwarePrice + totalServicesPrice + shippingPrice;
  const overallMargin =
    grandTotalPrice > 0 ? ((grandTotalPrice - grandTotalCost) / grandTotalPrice) * 100 : 0;

  return {
    items,
    serviceItems,
    totalCameras,
    nvrCount,
    retention,
    totalHardwareCost,
    totalHardwarePrice,
    totalServicesCost,
    totalServicesPrice,
    shippingCost,
    shippingPrice,
    shippingPercent: shipPct,
    grandTotalCost,
    grandTotalPrice,
    overallMargin,
  };
}
