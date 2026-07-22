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
    wifiQuality = 'better',
    licenseTerm = 5,
    gatewayModel = 'NSE3000',
    deploymentType = 'ceiling',
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
    // A per-team display alias (0065) changes the merged product's `sku`;
    // `baseSku` keeps the identity this engine references literally.
    const base = catalogSnapshot?.[sku]
      ?? allProducts.find((p) => p.sku === sku || p.baseSku === sku);
    if (!base) return null; // Fix #3 — caller handles null gracefully.
    const override = priceOverrides[sku];
    return {
      ...base,
      cost: override?.cost ?? base.cost,
      price: override?.price ?? base.price,
    };
  }

  function addItem(sku, qty, note = '') {
    // Per-line overrides (BOM table edit mode) ride in priceOverrides keyed
    // by the ORIGINAL sku: cost/price (applied in getProduct) plus qty, a
    // display sku, a description, and removal.
    const ov = priceOverrides[sku];
    if (ov?.removed) return;
    const effQty = ov?.qty ?? qty;
    if (effQty <= 0) return; // skip zero-quantity lines (matches the camera engine)
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
      sku: ov?.sku ?? p.sku,
      baseSku: sku, // override key stays the identity even when the displayed sku differs
      description: ov?.description ?? p.desc,
      qty: effQty,
      unitCost,
      unitPrice,
      totalCost: unitCost * effQty,
      totalPrice: unitPrice * effQty,
      total: unitPrice * effQty,
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

  // --- Step 1: resolve AP/switch selection ----------------------------------
  // Deployment values: 'ceiling' | 'wall' ('hallway' | 'inroom' on legacy
  // saved quotes — hallway APs were ceiling-mount, in-room were wallplates).
  const deployMount =
    deploymentType === 'inroom' || deploymentType === 'wall' ? 'wall' : 'ceiling';

  // Tag-based selection (0061): the catalog carries mount_type ('ceiling' |
  // 'wall'), quality_tier ('better' | 'best'), port_count / poe_watts /
  // poe_budget_watts, and per-term linked license SKUs. When a role has a
  // tagged match it wins; otherwise the legacy Cambium SKU matrix below is
  // the fallback, so untagged catalogs (and quotes locked before tagging)
  // are byte-identical to the old engine. Locked quotes search their frozen
  // snapshot, not the live catalog.
  const tagPool = catalogSnapshot ? Object.values(catalogSnapshot) : allProducts;
  const findTagged = (pred) =>
    tagPool
      .filter((p) => (p.technology ?? '') === 'managed_wifi' && pred(p))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || String(a.sku).localeCompare(String(b.sku)))[0] ?? null;
  const term = Number(licenseTerm) === 1 ? 1 : Number(licenseTerm) === 3 ? 3 : 5;
  const licenseFor = (p) => p?.[`license_sku_${term}yr`] || null;
  const addLicense = (p, qty) => {
    const lic = licenseFor(p);
    if (lic) addItem(lic, qty, `${term}yr license`);
  };

  const taggedGuestAP = findTagged(
    (p) => p.category === 'Access Point' && p.mount_type === deployMount && p.quality_tier === wifiQuality
  );
  // Switch classes by port count: ≤28 ports sizes like the 24, ≥44 like the 48.
  const taggedSwitch24 = findTagged(
    (p) => p.category === 'Switch' && p.quality_tier === wifiQuality &&
      Number(p.port_count) >= 8 && Number(p.port_count) <= 28
  );
  const taggedSwitch48 = findTagged(
    (p) => p.category === 'Switch' && p.quality_tier === wifiQuality && Number(p.port_count) >= 44
  );

  // Legacy Cambium SKU matrix (fallback + indoor/outdoor/aggregate roles).
  const isWifi7 = wifiGeneration === 'wifi7';
  const AP_CEILING = isWifi7 ? 'XV3-21X' : 'XV2-21X';
  const AP_WALLPLATE = isWifi7 ? 'XV3-22H' : 'XV2-22H';
  const AP_INDOOR = isWifi7 ? 'XV3-2X' : 'XV2-2X';
  const AP_OUTDOOR = isWifi7 ? 'XV3-23T' : 'XV2-23T';
  const SUB_CEILING = isWifi7 ? 'MSX-SUB-XV3-21X-5' : 'MSX-SUB-XV2-21X-5';
  const SUB_WALLPLATE = isWifi7 ? 'MSX-SUB-XV3-22H-5' : 'MSX-SUB-XV2-22H-5';
  const SUB_INDOOR = isWifi7 ? 'MSX-SUB-XV3-2X-5' : 'MSX-SUB-XV2-2X-5';
  const SUB_OUTDOOR = isWifi7 ? 'MSX-SUB-XV3-23T-5' : 'MSX-SUB-XV2-23T-5';

  // Fix #8 — Wi-Fi 7 has no wallplate SKU in the LEGACY matrix; force ceiling
  // there. A tagged wall AP is exempt (the tag says the wall product exists).
  const inRoom = deployMount === 'wall' && !isWifi7;

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
  if (taggedGuestAP) {
    // Tag-selected AP: mount + quality from the catalog; license (if linked)
    // follows the quote's term. Cambium-specific wallplate accessories are a
    // legacy-path concern only.
    addItem(
      taggedGuestAP.sku,
      guestRoomAPs,
      deployMount === 'wall' ? 'Guest Room APs (On Wall)' : 'Guest Room APs (On Ceiling)'
    );
    addLicense(taggedGuestAP, guestRoomAPs);
  } else if (inRoom) {
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
    if (taggedGuestAP) {
      addItem(taggedGuestAP.sku, spareCount, 'Spare APs (5%)');
      addLicense(taggedGuestAP, spareCount);
    } else {
      const spareAP = inRoom ? AP_WALLPLATE : AP_CEILING;
      const spareSub = inRoom ? SUB_WALLPLATE : SUB_CEILING;
      addItem(spareAP, spareCount, 'Spare APs (5%)');
      addItem(spareSub, spareCount, '5yr support for spares');
    }
  }

  // --- Step 6: totals for switch sizing -------------------------------------
  const totalAPs =
    guestRoomAPs + meetingRooms + publicAreaAPs + bohAPs + outdoorAPs;
  const totalPoEPorts = totalAPs + guestRoomWiredConnections;

  // --- Step 7: IDF edge switch sizing ---------------------------------------
  // Per-switch device capacity. Legacy constants: a 48-port carries up to 46
  // PoE devices (uplinks reserved), a 24-port up to 22. A tagged switch's
  // capacity comes from its own port_count minus 2 uplinks — AND from its
  // PoE budget when both the switch's poe_budget_watts and the selected AP's
  // poe_watts are known: floor(budget / AP draw) devices, so a power-hungry
  // design adds switches instead of overloading them.
  const apDraw = Number(taggedGuestAP?.poe_watts) || 0;
  const capacityOf = (sw, legacyCap) => {
    if (!sw) return legacyCap;
    const usable = Math.max(1, (Number(sw.port_count) || legacyCap + 2) - 2);
    const budget = Number(sw.poe_budget_watts) || 0;
    const wattCap = budget > 0 && apDraw > 0 ? Math.floor(budget / apDraw) : Infinity;
    return Math.max(1, Math.min(usable, wattCap));
  };
  const cap48 = capacityOf(taggedSwitch48, 46);
  const cap24 = capacityOf(taggedSwitch24, 22);

  const apsPerIDF = Math.ceil(totalPoEPorts / idfCount);
  let idfSwitches24 = 0;
  let idfSwitches48 = 0;

  for (let i = 0; i < idfCount; i++) {
    let portsNeeded = Math.min(apsPerIDF, totalPoEPorts - i * apsPerIDF);
    if (portsNeeded <= 0) continue;
    // Carry the bulk on 48-class switches, then size the remainder: a
    // 24-class for a small tail, otherwise one more 48. Prefer density.
    while (portsNeeded > cap48) {
      idfSwitches48 += 1;
      portsNeeded -= cap48;
    }
    if (portsNeeded <= cap24) idfSwitches24 += 1;
    else idfSwitches48 += 1;
  }

  const totalIdfSwitches = idfSwitches24 + idfSwitches48;

  if (idfSwitches24 > 0) {
    if (taggedSwitch24) {
      addItem(taggedSwitch24.sku, idfSwitches24, 'IDF Edge PoE Switch (24-port class)');
      addLicense(taggedSwitch24, idfSwitches24);
    } else {
      addItem('MX-EX2028PxA-U', idfSwitches24, 'IDF Edge PoE+ Switch (24-port)');
      addItem('MSX-SUB-EX2028-P-5', idfSwitches24, '5yr support');
    }
  }
  if (idfSwitches48 > 0) {
    if (taggedSwitch48) {
      addItem(taggedSwitch48.sku, idfSwitches48, 'IDF Edge PoE Switch (48-port class)');
      addLicense(taggedSwitch48, idfSwitches48);
    } else {
      addItem('MXEX2052GxPA01', idfSwitches48, 'IDF Edge PoE+ Switch (48-port)');
      addItem('MSX-SUB-EX2052-P-5', idfSwitches48, '5yr support');
    }
  }

  // --- Step 8: spare switch -------------------------------------------------
  if (spareSwitches && totalIdfSwitches > 0) {
    if (taggedSwitch24 || taggedSwitch48) {
      const spareSw = taggedSwitch24 ?? taggedSwitch48;
      addItem(spareSw.sku, 1, 'Spare PoE Switch');
      addLicense(spareSw, 1);
    } else {
      addItem('MX-EX2028PxA-U', 1, 'Spare PoE+ Switch');
      addItem('MSX-SUB-EX2028-P-5', 1, '5yr support for spare');
    }
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
    const coreSkus = new Set(
      ['MX-EX2028PxA-U', 'MXEX2052GxPA01', taggedSwitch24?.sku, taggedSwitch48?.sku].filter(Boolean)
    );
    const coreSwitch = items.find((i) => coreSkus.has(i.sku));
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
  const miscOv = priceOverrides['MISC-HW'];
  if (miscHwPercent > 0) {
    // Percent-based misc line bypasses addItem (its cost/price are computed),
    // but still honors the display and removal overrides.
    if (!miscOv?.removed) {
      const hwCostSubtotal = items.reduce((s, i) => s + i.totalCost, 0);
      const hwPriceSubtotal = items.reduce((s, i) => s + i.totalPrice, 0);
      const miscCost = hwCostSubtotal * (miscHwPercent / 100);
      const miscPrice = hwPriceSubtotal * (miscHwPercent / 100);
      items.push({
        sku: miscOv?.sku ?? 'MISC-HW',
        baseSku: 'MISC-HW',
        description: miscOv?.description ?? 'Miscellaneous Hardware Components',
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
    }
  } else {
    addItem('MISC-HW', 1, 'Miscellaneous hardware');
  }

  // --- Step 16: professional services ---------------------------------------
  // Labor no longer lives in the hardware BOM. ALL professional labor is driven
  // by the project-wide rate card (see lib/calculateLabor.js), so this engine
  // emits hardware only and serviceItems stays empty. The `serviceOverrides`
  // parameter is a legacy slot and is ignored (kept so positional call sites
  // stay valid; the app no longer stores service overrides).

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
