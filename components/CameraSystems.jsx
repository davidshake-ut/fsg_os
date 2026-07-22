'use client';

import { Video } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import BOMTable from '@/components/BOMTable';
import { currency } from '@/lib/format';

// The dashboard KPI strip is rendered once at the page level (SummaryCards),
// so this tab shows only the camera BOM + a subtotal — no duplicate cards.
export default function CameraSystems({
  cameraBom,
  showMargin,
  setShowMargin,
  priceOverrides,
  setPriceOverrides,
  editPrices,
  setEditPrices,
  canViewMargin = true,
  onAddCustom,
  onUpdateCustom,
  onRemoveCustom,
  onDiscard,
}) {
  return (
    <div className="space-y-4">
      {cameraBom.items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Video size={22} />
          </span>
          <p className="text-sm font-medium text-slate-700">No cameras added yet</p>
          <p className="max-w-xs text-xs text-slate-400">
            Enter camera quantities and a retention period in the panel on the left to build a
            camera-system BOM.
          </p>
        </Card>
      ) : (
        <>
          <BOMTable
            bom={cameraBom}
            showMargin={showMargin}
            setShowMargin={setShowMargin}
            priceOverrides={priceOverrides}
            setPriceOverrides={setPriceOverrides}
            editPrices={editPrices}
            setEditPrices={setEditPrices}
            canViewMargin={canViewMargin}
            onAddCustom={onAddCustom}
            onUpdateCustom={onUpdateCustom}
            onRemoveCustom={onRemoveCustom}
            onDiscard={onDiscard}
          />

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-sm">
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="px-4 py-2.5 text-slate-700">Hardware Subtotal</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {currency(cameraBom.totalHardwarePrice)}
                  </td>
                </tr>
                {cameraBom.shippingPrice > 0 && (
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">
                      Estimated Shipping ({cameraBom.shippingPercent ?? 7}%)
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {currency(cameraBom.shippingPrice)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-base font-bold">
                  <td className="px-4 py-3 text-slate-800">Total Camera System Estimate</td>
                  <td className="px-4 py-3 text-right tabular-nums text-blue-700">
                    {currency(cameraBom.grandTotalPrice)}
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>

          <p className="px-1 text-xs italic text-slate-400">
            * Budgetary estimate only. Final pricing may vary. Valid for 30 days.
          </p>
        </>
      )}
    </div>
  );
}
