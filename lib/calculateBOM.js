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
import { inheritedPrice } from './pricingPolicy';

export function calculateBOM(
  inputs,
  priceOverrides = {},
  serviceOverrides = {},
  allProducts = [],
  customItems = [],
  catalogSnapshot = null,
  takeoff = null // lib/wifiTakeoff.js result — sizes the design from the property model
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

  // Takeoff mode (complex-project Builder, Phase 2): a lib/wifiTakeoff.js
  // result sizes the design from the property model — unit APs from the
  // coverage rules, one switch stack per telecom room, per-unit switches
  // for townhomes, amenity / outdoor counts from the named lists. Without
  // it, the rooms / ratio inputs and the even IDF split run exactly as before.
  const useTakeoff = !!(takeoff && Array.isArray(takeoff.rooms));
  const takeoffRooms = useTakeoff ? takeoff.rooms.filter((r) => !r.townhome) : [];
  const overhead = useTakeoff ? Math.max(0, Number(takeoff.overheadPct) || 0) / 100 : 0;

  // Fix #4 — never divide by zero; a real deployment has at least one IDF.
  // In takeoff mode the IDFs are the telecom rooms other than the MDF.
  const idfCount = useTakeoff
    ? Math.max(1, takeoffRooms.filter((r) => !r.isMdf).length)
    : Math.max(1, Number(numberOfIDFs) || 0);

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

  function addItem(sku, qty, note = '', inheritFrom = null) {
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
    // Under a cost-plus policy a linked license sells at its device's
    // markup (inheritFrom); an explicit per-line price override still wins.
    const inherited = inheritFrom ? inheritedPrice(inheritFrom, unitCost) : null;
    const unitPrice = ov?.price ?? inherited ?? p.price;
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
    if (lic) addItem(lic, qty, `${term}yr license`, p);
  };

  const taggedGuestAP = findTagged(
    (p) => p.category === 'Access Point' && p.mount_type === deployMount && p.quality_tier === wifiQuality
  );
  // Switch classes by port count: 13–28 ports sizes like the 24, ≥44 like
  // the 48, 4–12 is the small class (takeoff mode only: per-townhome
  // switches and hand-added room extras; the legacy matrix has no small
  // switch, so an untagged catalog sizes those as 24s).
  const taggedSwitch24 = findTagged(
    (p) => p.category === 'Switch' && p.quality_tier === wifiQuality &&
      Number(p.port_count) > 12 && Number(p.port_count) <= 28
  );
  const taggedSwitch48 = findTagged(
    (p) => p.category === 'Switch' && p.quality_tier === wifiQuality && Number(p.port_count) >= 44
  );
  const taggedSwitch8 = findTagged(
    (p) => p.category === 'Switch' && p.quality_tier === wifiQuality &&
      Number(p.port_count) >= 4 && Number(p.port_count) <= 12
  );
  // Takeoff mode also resolves the gateway, the core / aggregate switch,
  // and the outdoor AP from tags (mount_type 'outdoor'); classic quotes keep
  // the legacy roles so nothing they price changes.
  const taggedGateway = useTakeoff
    ? findTagged((p) => p.category === 'Gateway' && p.quality_tier === wifiQuality)
    : null;
  const taggedAgg = useTakeoff
    ? findTagged((p) => p.category === 'Aggregate Switch' && p.quality_tier === wifiQuality)
    : null;
  const taggedOutdoorAP = useTakeoff
    ? findTagged((p) => p.category === 'Access Point' && p.mount_type === 'outdoor' && p.quality_tier === wifiQuality)
    : null;
  // Accessories (gateway UPS + optics, patch cables) itemize on classic
  // quotes; takeoff mode folds them into the misc-hardware allowance unless
  // asked to itemize. Racks come from Digital Infrastructure's kits when the
  // property quotes them.
  const itemize = !useTakeoff || takeoff.itemizeAccessories === true;
  const racksFromKits = useTakeoff && takeoff.racksFromKits === true;
  // Phase 8: under XGS-PON the unit APs hang off ONTs (Digital
  // Infrastructure quotes the OLT / ONTs / injectors); the closets carry no
  // PoE switches for them, the townhomes get ONUs instead of switches, and
  // only the amenity / outdoor APs still ride a switch at the common room.
  const ponMode = useTakeoff && takeoff.architecture === 'xgs_pon';
  const commonRoomId = ponMode ? ((takeoffRooms.find((r) => r.isMdf) ?? takeoffRooms[0])?.id ?? null) : null;

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
  const gatewayQty = useTakeoff && takeoff.redundantGateway ? 2 : 1;
  if (taggedGateway) {
    addItem(taggedGateway.sku, gatewayQty, gatewayQty > 1 ? 'Gateway / router — redundant pair' : 'Gateway / router');
    addLicense(taggedGateway, gatewayQty);
  } else {
    addItem(gatewayModel === 'NSE4000' ? 'NSE4000' : 'NSE3000', gatewayQty, gatewayQty > 1 ? 'Redundant pair' : '');
  }
  if (itemize) {
    addItem('PSI5-1500RT120', 1);
    addItem('SFP-1G-SX', 4, 'Gateway SFP modules');
    addItem('CAT6-3ft-RED', 4, 'Gateway patch cables');
  }

  // --- Step 3: guest room APs ----------------------------------------------
  // Floor the ratio at 1 to avoid divide-by-zero / Infinity (mirrors the
  // numberOfIDFs guard); the UI restricts this today, but keep the engine safe.
  const apRatio = Math.max(1, Number(apToRoomRatio) || 1);
  const guestRoomAPs = useTakeoff
    ? Math.max(0, Math.round(Number(takeoff.unitAPs) || 0))
    : Math.ceil(numberOfRooms / apRatio);
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
  // Takeoff mode can source these from the property's named location lists
  // (null = the lists aren't in use → the typed counts apply).
  const amenityAPs =
    useTakeoff && takeoff.amenityAPs != null ? Math.max(0, Math.round(Number(takeoff.amenityAPs) || 0)) : publicAreaAPs;
  const outdoorCount =
    useTakeoff && takeoff.outdoorAPs != null ? Math.max(0, Math.round(Number(takeoff.outdoorAPs) || 0)) : outdoorAPs;
  if (amenityAPs > 0) {
    if (useTakeoff && taggedGuestAP) {
      // The takeoff quotes amenity spaces with the same tagged AP as the units.
      addItem(taggedGuestAP.sku, amenityAPs, 'Amenity / common-area APs');
      addLicense(taggedGuestAP, amenityAPs);
    } else {
      addItem(AP_INDOOR, amenityAPs);
      addItem(SUB_INDOOR, amenityAPs);
    }
  }
  if (bohAPs > 0) {
    addItem(AP_CEILING, bohAPs);
    addItem(SUB_CEILING, bohAPs);
  }
  if (outdoorCount > 0) {
    if (taggedOutdoorAP) {
      addItem(taggedOutdoorAP.sku, outdoorCount, 'Outdoor APs');
      addLicense(taggedOutdoorAP, outdoorCount);
    } else {
      addItem(AP_OUTDOOR, outdoorCount);
      addItem(SUB_OUTDOOR, outdoorCount);
    }
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
    guestRoomAPs + meetingRooms + amenityAPs + bohAPs + outdoorCount;
  const totalPoEPorts = totalAPs + guestRoomWiredConnections;

  // --- Step 7: IDF edge switch sizing ---------------------------------------
  // Per-switch device capacity. Legacy constants: a 48-port carries up to 46
  // PoE devices (uplinks reserved), a 24-port up to 22. A tagged switch's
  // capacity comes from its own port_count minus 2 uplinks — AND from its
  // PoE budget when both the switch's poe_budget_watts and the selected AP's
  // poe_watts are known: floor(budget / AP draw) devices, so a power-hungry
  // design adds switches instead of overloading them.
  const apDraw = Number(taggedGuestAP?.poe_watts) || 0;
  // Takeoff mode reserves spare ports: usable ports shrink by the overhead
  // factor (20% → a 24-port carries 18 devices by ports, 16 by PoE budget).
  const capacityOf = (sw, legacyCap) => {
    if (!sw) return Math.max(1, Math.floor(legacyCap / (1 + overhead)));
    const usable = Math.max(1, Math.floor(((Number(sw.port_count) || legacyCap + 2) - 2) / (1 + overhead)));
    const budget = Number(sw.poe_budget_watts) || 0;
    const wattCap = budget > 0 && apDraw > 0 ? Math.floor(budget / apDraw) : Infinity;
    return Math.max(1, Math.min(usable, wattCap));
  };
  const cap48 = capacityOf(taggedSwitch48, 46);
  const cap24 = capacityOf(taggedSwitch24, 22);

  const apsPerIDF = Math.ceil(totalPoEPorts / idfCount);
  let idfSwitches24 = 0;
  let idfSwitches48 = 0;
  let idfSwitches8 = 0;
  // Takeoff mode: one entry per telecom room (+ the townhome group) — what
  // the Builder's IDF Plan card renders and lets the user override.
  const idfPlan = [];

  if (useTakeoff) {
    for (const room of takeoffRooms) {
      const unitAps = Math.max(0, Math.round(Number(room.aps) || 0));
      // Switch-fed APs in this room: its unit APs — or, under PON, only the
      // amenity / outdoor APs, placed at the common room.
      const aps = ponMode ? (room.id === commonRoomId ? amenityAPs + outdoorCount : 0) : unitAps;
      const mix = { s8: 0, s24: 0, s48: 0 };
      if (room.overrides) {
        mix.s8 = Math.max(0, Math.round(Number(room.overrides.s8) || 0));
        mix.s24 = Math.max(0, Math.round(Number(room.overrides.s24) || 0));
        mix.s48 = Math.max(0, Math.round(Number(room.overrides.s48) || 0));
      } else if (aps > 0) {
        // Same packing as the even split below, per room: the bulk on 48s,
        // a 24 for a small tail, otherwise one more 48.
        let remaining = aps;
        while (remaining > cap48) {
          mix.s48 += 1;
          remaining -= cap48;
        }
        if (remaining <= cap24) mix.s24 += 1;
        else mix.s48 += 1;
      }
      idfSwitches8 += mix.s8;
      idfSwitches24 += mix.s24;
      idfSwitches48 += mix.s48;
      idfPlan.push({
        roomId: room.id,
        name: room.name,
        isMdf: !!room.isMdf,
        levelNames: room.levelNames ?? [],
        units: Math.max(0, Number(room.units) || 0),
        aps,
        unitAps,
        pon: ponMode,
        ports: Math.ceil(aps * (1 + overhead)),
        ...mix,
        overridden: !!room.overrides,
        townhome: false,
        poeWatts: apDraw > 0 ? aps * apDraw : null,
      });
    }
    // Townhomes: every unit hosts its own small PoE switch (no shared
    // closet) — under PON a multi-port ONU serves the townhome rack instead.
    if (takeoff.switchPerTownhome && !ponMode) {
      const th = Math.max(0, Math.round(Number(takeoff.townhomeUnits) || 0));
      if (th > 0) {
        const thAPs = Math.max(0, Math.round(Number(takeoff.townhomeAPs) || 0));
        idfSwitches8 += th;
        idfPlan.push({
          roomId: null,
          name: 'Townhomes — one switch per unit',
          isMdf: false,
          levelNames: [],
          units: th,
          aps: thAPs,
          ports: Math.ceil(thAPs * (1 + overhead)),
          s8: th,
          s24: 0,
          s48: 0,
          overridden: false,
          townhome: true,
          poeWatts: apDraw > 0 ? thAPs * apDraw : null,
        });
      }
    }
  } else {
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
  }

  const totalIdfSwitches = idfSwitches24 + idfSwitches48 + idfSwitches8;

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
  if (idfSwitches8 > 0) {
    if (taggedSwitch8) {
      addItem(taggedSwitch8.sku, idfSwitches8, 'Small PoE Switch (8-port class)');
      addLicense(taggedSwitch8, idfSwitches8);
    } else if (taggedSwitch24) {
      addItem(taggedSwitch24.sku, idfSwitches8, 'Small PoE switch — no 8-port class tagged; sized as 24-port');
      addLicense(taggedSwitch24, idfSwitches8);
    } else {
      addItem('MX-EX2028PxA-U', idfSwitches8, 'Small PoE+ switch — no 8-port class in catalog; sized as 24-port');
      addItem('MSX-SUB-EX2028-P-5', idfSwitches8, '5yr support');
    }
  }
  // In-unit unmanaged switches for units designed with 2+ APs (takeoff
  // mode). Always counted; a BOM line only once a catalog SKU is chosen.
  // Phase 8: or one in every unit (a private LAN behind each ONT).
  const inUnitSwitches = !useTakeoff
    ? 0
    : takeoff.inUnitSwitchEveryUnit
      ? Math.max(0, Math.round(Number(takeoff.units) || 0))
      : takeoff.inUnitSwitchForMultiAp
        ? Math.max(0, Math.round(Number(takeoff.multiApUnits) || 0))
        : 0;
  if (inUnitSwitches > 0 && takeoff.inUnitSwitchSku) {
    addItem(takeoff.inUnitSwitchSku, inUnitSwitches, takeoff.inUnitSwitchEveryUnit ? 'In-unit switch (every unit)' : 'In-unit switch (units with 2+ APs)');
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
    if (taggedAgg) {
      addItem(taggedAgg.sku, 1, 'Core/MDF Aggregate Switch');
      addLicense(taggedAgg, 1);
    } else if (useCopperAgg) {
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
  // (none under PON — the OLT's uplinks are quoted with the PON gear)
  const fiberLinks = needsAggSwitch && !useCopperAgg && !ponMode ? idfCount : 0;
  if (fiberLinks > 0) {
    addItem('SFP-10G-SR', fiberLinks * 2, '10G MMF SFP+ modules (both ends)');
    addItem('GS-LC2-05-10G', fiberLinks, 'OM4 LC-LC 5M Fiber Patch Cables');
  }

  // --- Step 11: patch cables ------------------------------------------------
  if (itemize) {
    addItem('CAT6-5ft-BLUE', totalIdfSwitches + 1, 'Uplink patch cables (blue)');

    const purpleQty = Math.max(12, Math.ceil((totalIdfSwitches + 1) * 6));
    addItem('CAT6-1ft-PURPLE', purpleQty);
    addItem('CAT6-3ft-PURPLE', purpleQty);
    addItem('CAT6-5ft-PURPLE', purpleQty);

    const apCableQty = Math.ceil(totalAPs * 1.03);
    addItem('CAT6-15ft-BLACK', apCableQty, 'AP run patch cables (15ft black)');
  }

  // --- Step 12: rack hardware -----------------------------------------------
  // (skipped when Digital Infrastructure quotes the telecom-room kits)
  if (idfRacksNeeded && !racksFromKits) {
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
      // Under a cost-plus policy the allowance sells at the Miscellaneous
      // markup (cost × (1 + %)) like the takeoff sheet; otherwise it keeps
      // the same share of the price subtotal as before.
      const miscPolicyPrice = inheritedPrice(getProduct('MISC-HW'), miscCost);
      const miscPrice = miscPolicyPrice ?? hwPriceSubtotal * (miscHwPercent / 100);
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
    idfSwitches8,
    inUnitSwitches,
    needsAggSwitch,
    // Takeoff-mode extras (idfPlan is empty and takeoffUsed false on the
    // classic path; idfCount / unitCount then mirror the typed inputs).
    idfCount,
    unitCount: useTakeoff ? Math.max(0, Number(takeoff.units) || 0) : numberOfRooms,
    idfPlan,
    takeoffUsed: useTakeoff,
    ponMode,
  };
}
