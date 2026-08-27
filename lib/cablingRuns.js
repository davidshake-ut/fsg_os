// Structured-cabling run types — complex-project Builder, Phase 4. The
// registry behind the Digital Infrastructure cabling table: what each run
// is, how its quantity derives from the property model, and which Cabling
// SKU (cost / price per drop) it defaults to. No imports so both the
// property model (defaults / normalization) and the takeoff can use it.
//
// Per-quote settings persist at inputs.techCalc.digital_infrastructure.cabling:
//   { enabled, runs: { [key]: { sku?, qty?: number | null, enabled?: boolean } } }
// qty null (or absent) = use the derived count; a number = entered by hand.

export const CABLING_RUN_TYPES = [
  {
    key: 'streetToMdf',
    label: 'Street to MDF',
    defaultSku: 'CBL-STREET-MDF',
    derive: 'one',
    hint: 'Service entrance — one run when the property has an MDF',
  },
  {
    key: 'backbone',
    label: 'MDF to IDF backbone',
    defaultSku: 'CBL-BACKBONE',
    derive: 'perBuilding',
    hint: 'One riser per building with a telecom room — enter more for extra risers or redundant paths',
  },
  {
    key: 'idfLinks',
    label: 'IDF to IDF links',
    defaultSku: 'CBL-IDF-LINK',
    derive: 'chain',
    hint: 'Closets chained within a building: rooms − 1 per building',
  },
  {
    key: 'unitCat6',
    label: 'IDF to unit — Cat6',
    defaultSku: 'CBL-UNIT-CAT6',
    derive: 'perUnit',
    hint: 'One drop per unit',
  },
  {
    key: 'unitFiber',
    label: 'IDF to unit — fiber',
    defaultSku: 'CBL-UNIT-FIBER',
    derive: 'perUnit',
    hint: 'Dark fiber to every unit (untick for copper-only)',
  },
  {
    key: 'inUnitCat6',
    label: 'In-unit Cat6 (panel to AP)',
    defaultSku: 'CBL-INUNIT-CAT6',
    derive: 'perUnitAP',
    hint: 'One per in-unit AP from the Wi-Fi coverage rules',
  },
  {
    key: 'commonDrops',
    label: 'Amenity & common-area drops',
    defaultSku: 'CBL-COMMON-DROP',
    derive: 'perLocation',
    hint: 'Amenity + outdoor APs + included other drops from the property lists',
  },
  {
    key: 'townhomeDrops',
    label: 'Townhome drops',
    defaultSku: 'CBL-TOWNHOME-DROP',
    derive: 'perTownhome',
    hint: 'One per townhome unit',
  },
];

export const CABLING_RUN_KEYS = CABLING_RUN_TYPES.map((r) => r.key);

export const CABLING_DEFAULTS = { enabled: true, runs: {} };
