'use client';

import WifiInputPanel from '@/components/InputPanel';
import BOMTable from '@/components/BOMTable';
import SummaryCards from '@/components/SummaryCards';

// The original Wi-Fi engine adapted onto the calculator contract. Its design
// inputs and BOM stay in the Builder's dedicated state (inputs / bom +
// overrides) so saved quotes are untouched — the adapter only renders the
// existing components from ctx.

function InputPanel({ ctx }) {
  return <WifiInputPanel inputs={ctx.inputs} setInputs={ctx.setInputs} term={ctx.term} />;
}

function Body({ ctx }) {
  return (
    <>
      <SummaryCards
        view="wifi"
        bom={ctx.bom}
        cameraBom={ctx.cameraBom}
        labor={ctx.labor}
        term={ctx.term}
        canViewMargin={ctx.canViewMargin}
      />
      <BOMTable
        bom={ctx.bom}
        showMargin={ctx.showMargin}
        setShowMargin={ctx.setShowMargin}
        priceOverrides={ctx.priceOverrides}
        setPriceOverrides={ctx.setPriceOverrides}
        editPrices={ctx.editPrices}
        setEditPrices={ctx.setEditPrices}
        canViewMargin={ctx.canViewMargin}
        onAddCustom={(seg) => ctx.addCustomLine('wifi', seg)}
        onUpdateCustom={ctx.updateCustomLine}
        onRemoveCustom={ctx.removeCustomLine}
        onDiscard={ctx.discardBomChanges}
      />
    </>
  );
}

export const wifiCalculator = { techId: 'managed_wifi', legacy: 'wifi', InputPanel, Body };
