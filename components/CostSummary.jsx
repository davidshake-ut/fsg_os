'use client';

import { Card, Badge } from '@/components/ui/primitives';
import { currency, percent, marginColor, marginBg } from '@/lib/format';
import { hasContent, isAlternate, optionTags, optionGroups } from '@/lib/vendorComparison';
import VendorComparison from '@/components/builder/VendorComparison';

function marginOf(cost, price) {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}

function MarginBadge({ cost, price }) {
  const m = marginOf(cost, price);
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${marginColor(m)}`}>
      {percent(m, 0)}
    </span>
  );
}

// `sections` = [{ title, bom, optionGroup?, isPrimary?, vendorName? }, …];
// `scope` = [{ title, text }, …]
// canViewMargin gates the internal cost/margin/profit figures — a plain
// 'user' role only ever sees the client-price column.
// A technology quoted with two or more vendors arrives as one section per
// vendor: the primary (Option A) counts toward the totals; alternates
// (Option B, C, …) render badged, stay out of the totals, and get an Option
// Comparison card underneath (lib/vendorComparison.js).
export default function CostSummary({ sections = [], scope = [], canViewMargin = true }) {
  const present = sections.filter(hasContent);
  const counted = present.filter((s) => !isAlternate(s));
  const tags = optionTags(sections);
  const groups = optionGroups(present);
  const grandCost = counted.reduce((s, x) => s + x.bom.grandTotalCost, 0);
  const grandPrice = counted.reduce((s, x) => s + x.bom.grandTotalPrice, 0);
  const profit = grandPrice - grandCost;
  const colCount = canViewMargin ? 4 : 2;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-4 py-2 font-medium">Category</th>
              {canViewMargin && <th className="px-4 py-2 text-right font-medium">Our Cost</th>}
              <th className="px-4 py-2 text-right font-medium">Client Price</th>
              {canViewMargin && <th className="px-4 py-2 text-right font-medium">Margin</th>}
            </tr>
          </thead>

          {present.map((section) => {
            const { title, bom } = section;
            const tag = tags.get(section);
            const alternate = isAlternate(section);
            const body = alternate ? 'text-slate-500' : 'text-slate-700';
            const strong = alternate ? 'text-slate-600' : 'text-slate-800';
            return (
            <tbody key={title}>
              <tr className="bg-slate-50">
                <td
                  colSpan={colCount}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{title}</span>
                    {tag &&
                      (tag.isPrimary ? (
                        <Badge className="border-blue-200 bg-blue-50 normal-case tracking-normal text-blue-700">
                          Option A · Quoted
                        </Badge>
                      ) : (
                        <Badge className="border-amber-200 bg-amber-50 normal-case tracking-normal text-amber-700">
                          Option {tag.letter} — Alternate
                        </Badge>
                      ))}
                  </span>
                </td>
              </tr>

              {bom.items.length > 0 && (
                <tr className="border-b border-slate-50">
                  <td className={`px-4 py-2.5 ${body}`}>Hardware &amp; Software</td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {currency(bom.totalHardwareCost)}
                    </td>
                  )}
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${body}`}>
                    {currency(bom.totalHardwarePrice)}
                  </td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right">
                      <MarginBadge cost={bom.totalHardwareCost} price={bom.totalHardwarePrice} />
                    </td>
                  )}
                </tr>
              )}

              {bom.totalServicesPrice > 0 && (
                <tr className="border-b border-slate-50">
                  <td className={`px-4 py-2.5 ${body}`}>
                    {bom.items.length ? 'Professional Services' : 'Professional Labor'}
                  </td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {currency(bom.totalServicesCost)}
                    </td>
                  )}
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${body}`}>
                    {currency(bom.totalServicesPrice)}
                  </td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right">
                      <MarginBadge cost={bom.totalServicesCost} price={bom.totalServicesPrice} />
                    </td>
                  )}
                </tr>
              )}

              {bom.shippingPrice > 0 && (
                <tr className="border-b border-slate-50">
                  <td className={`px-4 py-2.5 ${body}`}>
                    Estimated Shipping ({bom.shippingPercent ?? 7}%)
                  </td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {currency(bom.shippingCost)}
                    </td>
                  )}
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${body}`}>
                    {currency(bom.shippingPrice)}
                  </td>
                  {canViewMargin && (
                    <td className="px-4 py-2.5 text-right">
                      <MarginBadge cost={bom.shippingCost} price={bom.shippingPrice} />
                    </td>
                  )}
                </tr>
              )}

              <tr className="border-t border-slate-200 font-semibold">
                <td className={`px-4 py-2.5 ${strong}`}>
                  {title} Subtotal
                  {alternate && (
                    <span className="ml-2 text-xs font-normal text-amber-700">not in total</span>
                  )}
                </td>
                {canViewMargin && (
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {currency(bom.grandTotalCost)}
                  </td>
                )}
                <td className={`px-4 py-2.5 text-right tabular-nums ${strong}`}>
                  {currency(bom.grandTotalPrice)}
                </td>
                {canViewMargin && (
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                    {percent(marginOf(bom.grandTotalCost, bom.grandTotalPrice), 0)}
                  </td>
                )}
              </tr>
            </tbody>
            );
          })}

          <tfoot>
            <tr className="border-t-2 border-slate-300 text-base font-bold">
              <td className="px-4 py-3 text-slate-800">Total Project Estimate</td>
              {canViewMargin && (
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                  {currency(grandCost)}
                </td>
              )}
              <td className="px-4 py-3 text-right tabular-nums text-blue-700">
                {currency(grandPrice)}
              </td>
              {canViewMargin && (
                <td className="px-4 py-3 text-right tabular-nums">
                  {percent(marginOf(grandCost, grandPrice))}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
        </div>
      </Card>

      {canViewMargin && (
        <Card className={`flex items-center justify-between p-4 ${marginBg(marginOf(grandCost, grandPrice))}`}>
          <span className="text-sm font-medium text-slate-600">Gross Profit</span>
          <span className="text-2xl font-bold tabular-nums text-slate-900">{currency(profit)}</span>
        </Card>
      )}

      {groups.map((g) => (
        <VendorComparison key={g.techId} group={g} canViewMargin={canViewMargin} />
      ))}

      {scope.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Scope of Work</h3>
          <div className="space-y-3">
            {scope.map((b) => (
              <div key={b.title}>
                <h4 className="text-sm font-semibold text-[var(--brand,#2563eb)]">{b.title}</h4>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{b.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="px-1 text-xs italic text-slate-400">
        * Budgetary estimate only. Final pricing may vary. Valid for 30 days.
      </p>
    </div>
  );
}
