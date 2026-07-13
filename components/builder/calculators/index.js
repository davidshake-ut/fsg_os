// Mini-calculator registry — Tier 2 of the Universal System Builder.
//
// A calculator gives a technology a design-driven quoting surface (like the
// Wi-Fi and Camera engines) instead of only the generic parts picker.
// Register one here and the Builder routes that technology through it: its
// InputPanel renders in the left rail of the design sub-tab, and its
// computed lines feed the tech's section (summary, proposal, CSV/PDF)
// through lib/calculateTechBOM.js alongside any hand-added lines.
//
// Contract — a calculator is an object:
//   techId       registry id from lib/technologies.js
//   defaults     initial design inputs; persisted per quote at
//                inputs.techCalc[techId] (rides the saved_projects inputs
//                jsonb — adding a calculator needs no migration)
//   InputPanel   React component <InputPanel value onChange products ctx />
//                  value    — current design inputs (defaults ⊕ saved)
//                  onChange — (patch) => merged into inputs.techCalc[techId]
//   compute      optional (value, { products }) => line[] — the designed
//                system as lines in the TechnologyPage custom-line shape:
//                { sku, description, category, qty, cost, price, isService? }
//                They render read-only in the tech page's System Design
//                table and re-derive from the inputs on every change.
//   laborHours   optional (value, bom) => ({ [roleKey]: hours }) added into
//                the proposal labor estimate (lib/estimateLaborHours.js).
//                Include the tech's own PM/admin allocation — the flat
//                baselines in that file belong to the Wi-Fi/Camera designs.
//   Body         optional React component <Body ctx /> replacing the whole
//                design surface (otherwise: generic TechnologyPage with the
//                System Design table on top). The two legacy engines use it.
//   legacy       'wifi' | 'camera' — the two original engines, adapted
//                unchanged: their inputs/BOMs live in dedicated Builder
//                state (inputs / cameraInputs / bom / cameraBom), not
//                techCalc. New calculators never set this.
//
// ctx is the Builder's shared bag (calcCtx in app/builder/page.jsx): quote
// inputs, BOMs, price overrides, custom-line handlers, catalog, labor.

import { wifiCalculator } from './wifi';
import { cameraCalculator } from './camera';

const CALCULATORS = {
  managed_wifi: wifiCalculator,
  video_surveillance: cameraCalculator,
};

export function getCalculator(techId) {
  return CALCULATORS[techId] ?? null;
}
