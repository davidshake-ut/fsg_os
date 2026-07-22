'use client';

import CameraInputPanel from '@/components/CameraInputPanel';
import CameraSystems from '@/components/CameraSystems';
import SummaryCards from '@/components/SummaryCards';

// The original Camera engine adapted onto the calculator contract — same
// arrangement as the Wi-Fi adapter: dedicated Builder state, existing
// components, no behavior change.

function InputPanel({ ctx }) {
  return <CameraInputPanel cameraInputs={ctx.cameraInputs} setCameraInputs={ctx.setCameraInputs} />;
}

function Body({ ctx }) {
  return (
    <>
      <SummaryCards
        view="cameras"
        bom={ctx.bom}
        cameraBom={ctx.cameraBom}
        labor={ctx.labor}
        term={ctx.term}
        canViewMargin={ctx.canViewMargin}
      />
      <CameraSystems
        cameraBom={ctx.cameraBom}
        showMargin={ctx.showMargin}
        setShowMargin={ctx.setShowMargin}
        priceOverrides={ctx.priceOverrides}
        setPriceOverrides={ctx.setPriceOverrides}
        editPrices={ctx.editPrices}
        setEditPrices={ctx.setEditPrices}
        canViewMargin={ctx.canViewMargin}
        onAddCustom={(seg) => ctx.addCustomLine('camera', seg)}
        onUpdateCustom={ctx.updateCustomLine}
        onRemoveCustom={ctx.removeCustomLine}
        onDiscard={ctx.discardBomChanges}
      />
    </>
  );
}

export const cameraCalculator = { techId: 'video_surveillance', legacy: 'camera', InputPanel, Body };
