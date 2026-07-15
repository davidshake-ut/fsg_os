'use client';

import { useRef, useState } from 'react';
import { X, Upload, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Button } from '@/components/ui/primitives';
import { parseVendorPriceList, matchVendorRows } from '@/lib/vendorPriceImport';
import { costFromDiscount } from '@/lib/pricing';
import { currency } from '@/lib/format';
import { cn } from '@/lib/utils';

// Imports a vendor's raw price list (e.g. a distributor/manufacturer price
// book) and updates Price + recomputes Cost for SKUs already in the catalog.
// Deliberately never adds new products — anything in the vendor file that
// isn't already in the catalog is reported and skipped.
export default function VendorPriceImportModal({ allProducts, productLineDiscounts = {}, onApply, onClose }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'review' | 'done'
  const [parseErrors, setParseErrors] = useState([]);
  const [matched, setMatched] = useState([]); // [{ sku, price, productLine, description, oldCost, oldPrice, newCost }]
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [unmatchedSkus, setUnmatchedSkus] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const fileRef = useRef(null);

  const lineOptions = Object.keys(productLineDiscounts);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseVendorPriceList(text);
    if (errors.length && rows.length === 0) {
      setParseErrors(errors);
      return;
    }
    const { matched: m, unmatched } = matchVendorRows(rows, allProducts);
    // Price books often list a SKU more than once (sections, case/space
    // variants) — one upsert can't touch the same row twice, so keep the
    // LAST occurrence (the file's final word) and say so in the review.
    const bySku = new Map();
    for (const hit of m) bySku.set(hit.existing.sku, hit);
    const dupCount = m.length - bySku.size;
    const fileNotes = dupCount > 0
      ? [...errors, `${dupCount} duplicate SKU row${dupCount !== 1 ? 's' : ''} in the file — the last occurrence was used.`]
      : errors;
    const reviewRows = [...bySku.values()].map(({ vendorRow, existing }) => {
      const productLine = vendorRow.productLine || existing.product_line || '';
      const hasDiscount = productLine && productLine in productLineDiscounts;
      return {
        sku: existing.sku,
        desc: existing.desc,
        category: existing.category,
        technology: existing.technology,
        vendor: existing.vendor,
        preferred_vendor: existing.preferred_vendor,
        oldPrice: existing.price,
        newPrice: vendorRow.price,
        oldCost: existing.cost,
        productLine,
        newCost: hasDiscount ? costFromDiscount(vendorRow.price, productLineDiscounts[productLine]) : existing.cost,
      };
    });
    setMatched(reviewRows);
    setUnmatchedCount(unmatched.length);
    setUnmatchedSkus(unmatched.map((r) => r.sku));
    setParseErrors(fileNotes);
    setStep('review');
  };

  const setRowLine = (sku, productLine) => {
    setMatched((rows) =>
      rows.map((r) => {
        if (r.sku !== sku) return r;
        const hasDiscount = productLine && productLine in productLineDiscounts;
        return {
          ...r,
          productLine,
          newCost: hasDiscount ? costFromDiscount(r.newPrice, productLineDiscounts[productLine]) : r.oldCost,
        };
      })
    );
  };

  const apply = async () => {
    setApplying(true);
    setApplyErr(null);
    try {
      const rows = matched.map((r) => ({
        sku: r.sku,
        description: r.desc,
        category: r.category,
        technology: r.technology,
        vendor: r.vendor,
        preferred_vendor: r.preferred_vendor,
        product_line: r.productLine,
        price: r.newPrice,
        cost: r.newCost,
      }));
      await onApply(rows);
      setAppliedCount(rows.length);
      setStep('done');
    } catch (ex) {
      setApplyErr(ex.message);
    } finally {
      setApplying(false);
    }
  };

  const unresolvedCount = matched.filter((r) => !r.productLine).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <Card
        className="flex max-h-[85vh] w-full max-w-3xl flex-col p-0"
        role="dialog"
        aria-modal="true"
        aria-label="Update Prices from Vendor List"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Update Prices from Vendor List</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Upload a distributor/manufacturer price list (CSV). Only SKUs already in your catalog
                are updated — nothing new is added. Price is taken from the file; Cost is recomputed
                from each product&apos;s assigned Product Line discount (set below if missing).
              </p>
              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              <Button type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Choose File…
              </Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  {matched.length} matched
                </span>
                {unresolvedCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                    <AlertTriangle size={12} /> {unresolvedCount} need a Product Line assigned
                  </span>
                )}
                {unmatchedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setUnmatchedOpen((o) => !o)}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500 hover:bg-slate-200"
                  >
                    {unmatchedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {unmatchedCount} not in your catalog — skipped
                  </button>
                )}
              </div>

              {unmatchedOpen && (
                <div className="max-h-24 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-500">
                  {unmatchedSkus.join(', ')}
                </div>
              )}

              {matched.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                  No SKUs in this file matched your catalog.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Product Line</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matched.map((r) => (
                        <tr key={r.sku} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.sku}</td>
                          <td className="px-3 py-1.5">
                            <input
                              list="vendor-import-product-lines"
                              value={r.productLine}
                              onChange={(e) => setRowLine(r.sku, e.target.value)}
                              placeholder="Assign a line…"
                              className={cn(
                                'w-full rounded-lg border px-2 py-1 text-sm outline-none focus:border-blue-400',
                                r.productLine ? 'border-slate-200' : 'border-amber-300 bg-amber-50'
                              )}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.oldPrice !== r.newPrice ? (
                              <span>
                                <span className="text-slate-400 line-through">{currency(r.oldPrice)}</span>{' '}
                                <span className="font-medium text-slate-800">{currency(r.newPrice)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-700">{currency(r.newPrice)}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.oldCost !== r.newCost ? (
                              <span>
                                <span className="text-slate-400 line-through">{currency(r.oldCost)}</span>{' '}
                                <span className="font-medium text-slate-800">{currency(r.newCost)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500">{currency(r.oldCost)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <datalist id="vendor-import-product-lines">
                    {lineOptions.map((l) => <option key={l} value={l} />)}
                  </datalist>
                </div>
              )}

              {applyErr && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{applyErr}</div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-emerald-700">
                Updated price/cost for {appliedCount} product{appliedCount !== 1 ? 's' : ''}.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {step === 'review' && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={apply} disabled={applying || matched.length === 0}>
                {applying ? 'Applying…' : `Apply to ${matched.length} Product${matched.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
          {step === 'pick' && (
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          )}
          {step === 'done' && (
            <Button type="button" onClick={onClose}>Done</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
