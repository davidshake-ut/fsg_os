// Core BOM calculation engine — a PURE function.
// No side effects, no API calls, no state mutation of inputs. All data is passed in.
//
// Spec fixes applied (see docs/ build guide critique):
//   #1 Single-IDF deployment yields ONE switch (the IDF edge switch is the core).
//   #3 Missing SKU no longer throws — addItem() no-ops + warns, so a soft-deleted
//      core product can never crash a BOM.
//   #4 numberOfIDFs is floored at 1 to avoid divide-by-zero / Infinity sizing.
//   #8 Wi-Fi 7 forces hallway deployment in the engine, not just the UI.

import { toCustomLine } from './customLine';

export function calculateBOM(
  inputs,
  priceOverrides = {},
  serviceOverrides = {},
  allProducts = [],
  customItems = [],
  catalogSnapshot = null
) {
  const items = []; // hardware line items
  const serviceItems = []; // service line items

  const {
    propertyType = 'hospitality',
    includeWifi = true,
    wifiGeneration = 'wifi6',
    gatewayModel = 'NSE3000',
    deploymentType = 'hallway',
    numberOfRooms = 100,
    apToRoomRatio = 2,
    numberOfIDFs = 2,
    guestRoomWiredConnections = 0,
    b2bConnectionType = 'none',
    b2bConnectionQty = 1,
    meetingRooms = 0,
    publicAreaAPs = 0,
    bohAPs = 0,
    outdoorAPs = 0,
    businessCenterWired = 0,
    idfRacksNeeded = true,
    spareAPs = false,
    spareSwitches = false,
    cat6Required = false,
    cat6Drops = 0,
    aggSwitchType = 'fiber',
    miscHwPercent = 0,
    includeShipping = true,
    shippingPercent = 7,
  } = inputs;

  // Shipping is a project-level setting (toggle + editable %, default 7%).
  // Defaults preserve the legacy always-7% behavior.
  const shipPct = includeShipping ? Math.max(0, Number(shippingPercent) || 0) : 0;
  const shipFactor = shipPct / 100;

  // Fix #4 — never divide by zero; a real deployment has at least one IDF.
  const idfCount = Math.max(1, Number(numberOfIDFs) || 0);

  // --- Lookup helpers -------------------------------------------------------
  // A locked quote (sent/accepted/declined) passes its own frozen
  // catalogSnapshot so a later catalog/discount change never silently
  // reprices it — only drafts and new revisions read live allProducts.
  function getProduct(sku) {
    const base = catalogSnapshot?.[sku] ?? allProducts.find((p) => p.sku === sku);
    if (!base) return null; // Fix #3 — caller handles null gracefully.
    const override = priceOverrides[sku];
    return {
      ...base,
      cost: override?.cost ?? base.cost,
      price: override?.price ?? base.price,
    };
  }

  function addItem(sku, qty, note = '') {
    if (qty <= 0) return; // skip zero-quantity lines (matches the camera engine)
    const p = getProduct(sku);
    if (!p) {
      // Fix #3 — a soft-deleted / missing core product must not crash the BOM.
      if (typeof console !== 'undefined') {
        console.warn(`[calculateBOM] product not found, skipping line: ${sku}`);
      }
      return;
    }
    const unitCost = p.cost;
    const unitPrice = p.price;
    items.push({
      sku: p.sku,
      description: p.desc,
      qty,
      unitCost,
      unitPrice,
      totalCost: unitCost * qty,
      totalPrice: unitPrice * qty,
      total: unitPrice * qty,
      margin: unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : 0,
      category: p.category,
      note,
    });
  }

  // --- Camera-only quote: zero the Wi-Fi system -----------------------------
  // Skip all Wi-Fi hardware/services; keep any custom Wi-Fi lines the user added.
  if (!includeWifi) {
    for (const c of customItems) items.push(toCustomLine(c));
    const hwCost = items.reduce((s, i) => s + i.totalCost, 0);
    const hwPrice = items.reduce((s, i) => s + i.totalPrice, 0);
    const shipCost = hwCost * shipFactor;
    const shipPrice = hwPrice * shipFactor;
    const grandCost = hwCost + shipCost;
    const grandPrice = hwPrice + shipPrice;
    return {
      items,
      serviceItems: [],
      totalHardwareCost: hwCost,
      totalHardwarePrice: hwPrice,
      totalServicesCost: 0,
      totalServicesPrice: 0,
      shippingCost: shipCost,
      shippingPrice: shipPrice,
      shippingPercent: shipPct,
      grandTotalCost: grandCost,
      grandTotalPrice: grandPrice,
      overallMargin: grandPrice > 0 ? ((grandPrice - grandCost) / grandPrice) * 100 : 0,
      guestRoomAPs: 0,
      totalAPs: 0,
      totalIdfSwitches: 0,
      idfSwitches24: 0,
      idfSwitches48: 0,
      needsAggSwitch: false,
    };
  }

  // --- Step 1: derive AP SKUs from wifiGeneration ---------------------------
  const isWifi7 = wifiGeneration === 'wifi7';
  const AP_CEILING = isWifi7 ? 'XV3-21X' : 'XV2-21X';
  const AP_WALLPLATE = isWifi7 ? 'XV3-22H' : 'XV2-22H';
  const AP_INDOOR = isWifi7 ? 'XV3-2X' : 'XV2-2X';
  const AP_OUTDOOR = isWifi7 ? 'XV3-23T' : 'XV2-23T';
  const SUB_CEILING = isWifi7 ? 'MSX-SUB-XV3-21X-5' : 'MSX-SUB-XV2-21X-5';
  const SUB_WALLPLATE = isWifi7 ? 'MSX-SUB-XV3-22H-5' : 'MSX-SUB-XV2-22H-5';
  const SUB_INDOOR = isWifi7 ? 'MSX-SUB-XV3-2X-5' : 'MSX-SUB-XV2-2X-5';
  const SUB_OUTDOOR = isWifi7 ? 'MSX-SUB-XV3-23T-5' : 'MSX-SUB-XV2-23T-5';

  // Fix #8 — Wi-Fi 7 has no wallplate-in-room SKU path here; force hallway.
  const inRoom = deploymentType === 'inroom' && !isWifi7;

  // --- Step 2: gateway section (always) -------------------------------------
  addItem(gatewayModel === 'NSE4000' ? 'NSE4000' : 'NSE3000', 1);
  addItem('PSI5-1500RT120', 1);
  addItem('SFP-1G-SX', 4, 'Gateway SFP modules');
  addItem('CAT6-3ft-RED', 4, 'Gateway patch cables');

  // --- Step 3: guest room APs ----------------------------------------------
  // Floor the ratio at 1 to avoid divide-by-zero / Infinity (mirrors the
  // numberOfIDFs guard); the UI restricts this today, but keep the engine safe.
  const apRatio = Math.max(1, Number(apToRoomRatio) || 1);
  const guestRoomAPs = Math.ceil(numberOfRooms / apRatio);
  if (inRoom) {
    addItem(AP_WALLPLATE, guestRoomAPs, 'In-Room Wallplate APs');
    addItem(SUB_WALLPLATE, guestRoomAPs, '5yr support');
    addItem('PL-WALLMNTB-WW', guestRoomAPs, 'Flush mount adapters');
    addItem('CAT6-3in-BLACK', guestRoomAPs, '3" patch for wallplate AP');
  } else {
    addItem(AP_CEILING, guestRoomAPs, 'Guest Hallway Ceiling APs');
    addItem(SUB_CEILING, guestRoomAPs, '5yr support');
  }

  // --- Step 4: additional AP locations -------------------------------------
  if (meetingRooms > 0) {
    addItem(AP_INDOOR, meetingRooms);
    addItem(SUB_INDOOR, meetingRooms);
  }
  if (publicAreaAPs > 0) {
    addItem(AP_INDOOR, publicAreaAPs);
    addItem(SUB_INDOOR, publicAreaAPs);
  }
  if (bohAPs > 0) {
    addItem(AP_CEILING, bohAPs);
    addItem(SUB_CEILING, bohAPs);
  }
  if (outdoorAPs > 0) {
    addItem(AP_OUTDOOR, outdoorAPs);
    addItem(SUB_OUTDOOR, outdoorAPs);
  }

  // --- Step 5: spare APs (NOT counted in totalAPs) --------------------------
  if (spareAPs) {
    const spareCount = Math.max(1, Math.ceil(guestRoomAPs * 0.05));
    const spareAP = inRoom ? AP_WALLPLATE : AP_CEILING;
    const spareSub = inRoom ? SUB_WALLPLATE : SUB_CEILING;
    addItem(spareAP, spareCount, 'Spare APs (5%)');
    addItem(spareSub, spareCount, '5yr support for spares');
  }

  // --- Step 6: totals for switch sizing -------------------------------------
  const totalAPs =
    guestRoomAPs + meetingRooms + publicAreaAPs + bohAPs + outdoorAPs;
  const totalPoEPorts = totalAPs + guestRoomWiredConnections;

  // --- Step 7: IDF edge switch sizing ---------------------------------------
  const apsPerIDF = Math.ceil(totalPoEPorts / idfCount);
  let idfSwitches24 = 0;
  let idfSwitches48 = 0;

  for (let i = 0; i < idfCount; i++) {
    let portsNeeded = Math.min(apsPerIDF, totalPoEPorts - i * apsPerIDF);
    if (portsNeeded <= 0) continue;
    // Carry the bulk on 48-port switches (each handles up to 46 PoE devices,
    // reserving uplinks), then size the remainder: a 24-port for <=22 ports,
    // otherwise one more 48-port. Prefer 48-port density over fanning out 24s.
    while (portsNeeded > 46) {
      idfSwitches48 += 1;
      portsNeeded -= 46;
    }
    if (portsNeeded <= 22) idfSwitches24 += 1;
    else idfSwitches48 += 1;
  }

  const totalIdfSwitches = idfSwitches24 + idfSwitches48;

  if (idfSwitches24 > 0) {
    addItem('MX-EX2028PxA-U', idfSwitches24, 'IDF Edge PoE+ Switch (24-port)');
    addItem('MSX-SUB-EX2028-P-5', idfSwitches24, '5yr support');
  }
  if (idfSwitches48 > 0) {
    addItem('MXEX2052GxPA01', idfSwitches48, 'IDF Edge PoE+ Switch (48-port)');
    addItem('MSX-SUB-EX2052-P-5', idfSwitches48, '5yr support');
  }

  // --- Step 8: spare switch -------------------------------------------------
  if (spareSwitches && totalIdfSwitches > 0) {
    addItem('MX-EX2028PxA-U', 1, 'Spare PoE+ Switch');
    addItem('MSX-SUB-EX2028-P-5', 1, '5yr support for spare');
  }

  // --- Step 9: aggregate / core switch --------------------------------------
  const needsAggSwitch = idfCount > 1 || totalIdfSwitches > 1;
  const useCopperAgg = aggSwitchType === 'copper';

  if (needsAggSwitch) {
    if (useCopperAgg) {
      addItem('MXEX2052GxPA01', 1, 'Core/MDF Aggregate Switch (48-Port PoE+ Copper)');
      addItem('MSX-SUB-EX2052-P-5', 1, '5yr support');
    } else {
      addItem('MXEX3024xFxA01', 1, 'Core/MDF Aggregate Switch (10Gb Fiber)');
      addItem('MSX-SUB-EX3024F-5', 1, '5yr support');
    }
  } else {
    // Fix #1 — single-IDF/single-switch deployment: the IDF edge switch IS the
    // core. Do NOT add a second switch. Re-note the existing one for clarity.
    const coreSwitch = items.find(
      (i) => i.sku === 'MX-EX2028PxA-U' || i.sku === 'MXEX2052GxPA01'
    );
    if (coreSwitch) coreSwitch.note = 'Core switch (single-IDF deployment)';
  }

  // --- Step 10: fiber infrastructure ----------------------------------------
  const fiberLinks = needsAggSwitch && !useCopperAgg ? idfCount : 0;
  if (fiberLinks > 0) {
    addItem('SFP-10G-SR', fiberLinks * 2, '10G MMF SFP+ modules (both ends)');
    addItem('GS-LC2-05-10G', fiberLinks, 'OM4 LC-LC 5M Fiber Patch Cables');
  }

  // --- Step 11: patch cables ------------------------------------------------
  addItem('CAT6-5ft-BLUE', totalIdfSwitches + 1, 'Uplink patch cables (blue)');

  const purpleQty = Math.max(12, Math.ceil((totalIdfSwitches + 1) * 6));
  addItem('CAT6-1ft-PURPLE', purpleQty);
  addItem('CAT6-3ft-PURPLE', purpleQty);
  addItem('CAT6-5ft-PURPLE', purpleQty);

  const apCableQty = Math.ceil(totalAPs * 1.03);
  addItem('CAT6-15ft-BLACK', apCableQty, 'AP run patch cables (15ft black)');

  // --- Step 12: rack hardware -----------------------------------------------
  if (idfRacksNeeded) {
    addItem('RR1907-BK1', idfCount, 'IDF Full-Height 19" Rack');
    if (needsAggSwitch) {
      addItem('RR1907-BK1', 1, 'MDF Rack');
    }
    const totalRacks = needsAggSwitch ? idfCount + 1 : idfCount;
    addItem('RS-1215', totalRacks, 'Rack Power Strip (1 per rack)');
    addItem('W-75-MRL-BK', 1, 'Velcro cable management');
  }

  // --- Step 13: structured cabling ------------------------------------------
  if (cat6Required && cat6Drops > 0) {
    addItem('CAT6-DROP', cat6Drops, 'CAT6 Ethernet cabling drops');
  }

  // --- Step 14: building-to-building ----------------------------------------
  if (b2bConnectionType && b2bConnectionType !== 'none' && b2bConnectionQty > 0) {
    const b2bSkuMap = {
      fiber: 'B2B-FIBER',
      copper: 'B2B-COPPER',
      wireless: 'B2B-WIRELESS',
    };
    addItem(b2bSkuMap[b2bConnectionType], b2bConnectionQty, 'Building-to-Building Connection');
  }

  // --- Step 15: miscellaneous hardware (LAST hardware item) -----------------
  if (miscHwPercent > 0) {
    const hwCostSubtotal = items.reduce((s, i) => s + i.totalCost, 0);
    const hwPriceSubtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    const miscCost = hwCostSubtotal * (miscHwPercent / 100);
    const miscPrice = hwPriceSubtotal * (miscHwPercent / 100);
    items.push({
      sku: 'MISC-HW',
      description: 'Miscellaneous Hardware Components',
      qty: 1,
      unitCost: miscCost,
      unitPrice: miscPrice,
      totalCost: miscCost,
      totalPrice: miscPrice,
      total: miscPrice,
      margin: miscPrice > 0 ? ((miscPrice - miscCost) / miscPrice) * 100 : 0,
      category: 'Miscellaneous',
      note: `${miscHwPercent}% of hardware subtotal`,
    });
  } else {
    addItem('MISC-HW', 1, 'Miscellaneous hardware');
  }

  // --- Step 16: professional services ---------------------------------------
  // Labor no longer lives in the hardware BOM. ALL professional labor is driven
  // by the project-wide rate card (see lib/calculateLabor.js), so this engine
  // emits hardware only and serviceItems stays empty. `serviceOverrides` is kept
  // in the signature for backward compatibility with saved projects.

  // --- Custom line items (user-added, per-project; not in the catalog) ------
  for (const c of customItems) items.push(toCustomLine(c));

  // --- Step 17: financial totals --------------------------------------------
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
    guestRoomAPs,
    totalAPs,
    totalPoEPorts,
    totalIdfSwitches,
    idfSwitches24,
    idfSwitches48,
    needsAggSwitch,
  };
}
