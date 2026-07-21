'use client';

import { useRef, useState } from 'react';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { Card, Button } from '@/components/ui/primitives';
import { parseVendorPriceList, matchVendorRows, readVendorPriceFile, resolveImportCost, VENDOR_IMPORT_FIELDS } from '@/lib/vendorPriceImport';
import { costFromDiscount } from '@/lib/pricing';
import { currency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PRODUCT_CATEGORIES } from '@/lib/catalog';
import { companyTechnologies } from '@/lib/technologies';

// Imports a vendor's raw price list (e.g. a distributor/manufacturer price
// book): updates Price/Cost for SKUs already in the catalog, and offers the
// file's unknown SKUs as opt-in new products (checked per row, with bulk
// Technology/Vendor/Source pickers and a per-row Subcategory).
export default function VendorPriceImportModal({ allProducts, productLineDiscounts = {}, company = null, onApply, onClose }) {
  const [step, setStep] = useState('pick'); // 'pick' | 'map' | 'review' | 'done'
  const [parseErrors, setParseErrors] = useState([]);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [header, setHeader] = useState([]);
  const [sampleRows, setSampleRows] = useState([]);
  const [mapping, setMapping] = useState(null); // { sku, price, productLine, description } → column index
  const [matched, setMatched] = useState([]); // [{ sku, price, productLine, description, oldCost, oldPrice, newCost, fileCost, newDiscount }]
  const [newRows, setNewRows] = useState([]); // file SKUs not in the catalog — opt-in adds
  const [newTech, setNewTech] = useState(''); // bulk Technology for checked new rows
  const [newCategory, setNewCategory] = useState(''); // bulk Subcategory — stamps every new row
  const [newVendor, setNewVendor] = useState('');
  const [newSource, setNewSource] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const fileRef = useRef(null);

  const lineOptions = Object.keys(productLineDiscounts);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const { error, header: cols, sampleRows: samples, guess } = readVendorPriceFile(text);
    if (error) {
      setParseErrors([error]);
      return;
    }
    setFileText(text);
    setFileName(file.name);
    setHeader(cols);
    setSampleRows(samples);
    setMapping(guess);
    setParseErrors([]);
    setStep('map');
  };

  const runImport = () => {
    const { rows, errors } = parseVendorPriceList(fileText, mapping);
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
    const newBySku = new Map();
    for (const row of unmatched) newBySku.set(row.sku.trim(), row);
    const dupCount = m.length - bySku.size + (unmatched.length - newBySku.size);
    const fileNotes = dupCount > 0
      ? [...errors, `${dupCount} duplicate SKU row${dupCount !== 1 ? 's' : ''} in the file — the last occurrence was used.`]
      : errors;
    const reviewRows = [...bySku.values()].map(({ vendorRow, existing }) => {
      const productLine = vendorRow.productLine || existing.product_line || '';
      const { cost, fromFile } = resolveImportCost(vendorRow, {
        productLine,
        productLineDiscounts,
        fallback: existing.cost,
      });
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
        newCost: cost,
        fileCost: fromFile, // file-dictated cost — reassigning a line must not recompute it
        newDiscount: Number.isFinite(vendorRow.discount) ? vendorRow.discount : null,
      };
    });
    setMatched(reviewRows);
    setNewRows(
      [...newBySku.values()].map((row) => ({
        sku: row.sku.trim(),
        description: row.description,
        price: row.price,
        cost: resolveImportCost(row, { productLine: row.productLine, productLineDiscounts, fallback: 0 }).cost,
        discount: Number.isFinite(row.discount) ? row.discount : null,
        productLine: row.productLine,
        category: '', // per-row Subcategory, assigned in the review step
        checked: false,
      }))
    );
    setParseErrors(fileNotes);
    setStep('review');
  };

  const setRowLine = (sku, productLine) => {
    setMatched((rows) =>
      rows.map((r) => {
        if (r.sku !== sku) return r;
        if (r.fileCost) return { ...r, productLine }; // the file set this cost — keep it
        const hasDiscount = productLine && productLine in productLineDiscounts;
        return {
          ...r,
          productLine,
          newCost: hasDiscount ? costFromDiscount(r.newPrice, productLineDiscounts[productLine]) : r.oldCost,
        };
      })
    );
  };

  const toggleNewRow = (sku) =>
    setNewRows((rows) => rows.map((r) => (r.sku === sku ? { ...r, checked: !r.checked } : r)));
  const setNewRowCategory = (sku, category) =>
    setNewRows((rows) => rows.map((r) => (r.sku === sku ? { ...r, category } : r)));
  // Bulk Subcategory: stamps every new row (per-row selects can still override
  // afterward). Subcategory is optional — blank rows import as Miscellaneous
  // and can be fixed later with Bulk Edit.
  const setAllNewCategories = (category) => {
    setNewCategory(category);
    setNewRows((rows) => rows.map((r) => ({ ...r, category })));
  };
  const checkedNew = newRows.filter((r) => r.checked);
  const allNewChecked = newRows.length > 0 && checkedNew.length === newRows.length;
  const toggleAllNew = () => setNewRows((rows) => rows.map((r) => ({ ...r, checked: !allNewChecked })));
  // Checked new rows can't be written without a Technology.
  const newIssues = checkedNew.length > 0 && !newTech;

  const apply = async () => {
    setApplying(true);
    setApplyErr(null);
    try {
      const updateRows = matched.map((r) => ({
        sku: r.sku,
        description: r.desc,
        category: r.category,
        technology: r.technology,
        vendor: r.vendor,
        preferred_vendor: r.preferred_vendor,
        product_line: r.productLine,
        price: r.newPrice,
        cost: r.newCost,
        ...(r.newDiscount !== null ? { discount_pct: r.newDiscount } : {}),
      }));
      const addRows = checkedNew.map((r) => ({
        sku: r.sku,
        description: r.description || r.sku,
        category: r.category || 'Miscellaneous',
        technology: newTech,
        vendor: newVendor.trim(),
        preferred_vendor: newSource.trim(),
        product_line: r.productLine,
        price: r.price,
        cost: r.cost,
        ...(r.discount !== null ? { discount_pct: r.discount } : {}),
      }));
      await onApply([...updateRows, ...addRows]);
      setAppliedCount(updateRows.length);
      setAddedCount(addRows.length);
      setStep('done');
    } catch (ex) {
      setApplyErr(ex.message);
    } finally {
      setApplying(false);
    }
  };

  const unresolvedCount = matched.filter((r) => !r.productLine).length;

  // ── Mapping-step helpers ─────────────────────────────────────────────────
  const colLabel = (i) => header[i] || `Column ${i + 1}`;
  const colSamples = (i) => {
    if (i === -1) return '';
    return sampleRows
      .map((r) => String(r[i] ?? '').trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');
  };
  // The same column can't feed two required fields — that's always a mistake.
  const skuPriceCollide = mapping && mapping.sku !== -1 && mapping.sku === mapping.price;
  const mappingReady = mapping && mapping.sku !== -1 && mapping.price !== -1 && !skuPriceCollide;

  // ── New-product picker options ───────────────────────────────────────────
  const distinctVals = (get) => [...new Set(allProducts.map(get).filter(Boolean))].sort();
  const registryNames = [
    ...new Set(Object.values(company?.settings?.technologyVendors ?? {}).flat().map((v) => v?.name).filter(Boolean)),
  ];
  const vendorOptions = [...new Set([...distinctVals((p) => p.vendor), ...registryNames])].sort();
  const sourceOptions = distinctVals((p) => p.preferred_vendor);

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

          {step === 'map' && mapping && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Match the columns in <span className="font-medium text-slate-700">{fileName}</span> to
                the fields the importer needs — no need to rename anything in the file. We&apos;ve
                pre-filled our best guess; adjust any that are wrong.
              </p>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
                      <th className="px-3 py-2 font-medium">Importer field</th>
                      <th className="px-3 py-2 font-medium">Column in your file</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Sample values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VENDOR_IMPORT_FIELDS.map((f) => (
                      <tr key={f.key} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-700">{f.label}</span>
                          {f.required ? (
                            <span className="ml-1 text-red-400" title="Required">*</span>
                          ) : (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-300">optional</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[f.key]}
                            onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                            className={cn(
                              'w-full rounded-lg border bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400',
                              mapping[f.key] === -1 && f.required ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                            )}
                          >
                            <option value={-1}>{f.required ? 'Choose a column…' : '— Not in this file —'}</option>
                            {header.map((h, i) => (
                              <option key={i} value={i}>{colLabel(i)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="hidden max-w-[220px] truncate px-3 py-2 text-xs text-slate-400 sm:table-cell">
                          {colSamples(mapping[f.key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {skuPriceCollide && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  SKU and Price are mapped to the same column — pick a different column for one of them.
                </div>
              )}
              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
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
                {newRows.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-500">
                    {newRows.length} new in file
                  </span>
                )}
              </div>

              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
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

              {newRows.length > 0 && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Add new products
                      <span className="ml-2 font-normal text-slate-400">
                        {checkedNew.length} of {newRows.length} selected
                      </span>
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      These SKUs aren&apos;t in your catalog. Check the ones to add — unchecked rows are left out.
                      Subcategory is optional: rows left blank import as Miscellaneous (fix later with Bulk Edit).
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">
                        Technology{checkedNew.length > 0 && <span className="ml-0.5 text-red-400">*</span>}
                      </span>
                      <select
                        value={newTech}
                        onChange={(e) => setNewTech(e.target.value)}
                        className={cn(
                          'w-full rounded-lg border bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400',
                          checkedNew.length > 0 && !newTech ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                        )}
                      >
                        <option value="">Choose…</option>
                        {companyTechnologies(company).map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Subcategory — all rows</span>
                      <select
                        value={newCategory}
                        onChange={(e) => setAllNewCategories(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                      >
                        <option value="">Miscellaneous (default)</option>
                        {PRODUCT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Vendor</span>
                      <input
                        list="vendor-import-new-vendors"
                        value={newVendor}
                        onChange={(e) => setNewVendor(e.target.value)}
                        placeholder="e.g. Ruckus"
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Source / Distributor</span>
                      <input
                        list="vendor-import-new-sources"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        placeholder="e.g. Warehouse"
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </label>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
                          <th className="w-8 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={allNewChecked}
                              onChange={toggleAllNew}
                              aria-label="Select all new products"
                            />
                          </th>
                          <th className="px-3 py-2 font-medium">SKU</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="px-3 py-2 font-medium">Subcategory</th>
                          <th className="px-3 py-2 text-right font-medium">Price</th>
                          <th className="px-3 py-2 text-right font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newRows.map((r) => (
                          <tr key={r.sku} className={cn('border-b border-slate-50 last:border-0', !r.checked && 'opacity-60')}>
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={r.checked}
                                onChange={() => toggleNewRow(r.sku)}
                                aria-label={`Add ${r.sku}`}
                              />
                            </td>
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.sku}</td>
                            <td className="max-w-[220px] truncate px-3 py-1.5 text-xs text-slate-600">{r.description || '—'}</td>
                            <td className="px-3 py-1.5">
                              <select
                                value={r.category}
                                onChange={(e) => setNewRowCategory(r.sku, e.target.value)}
                                className="w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400"
                              >
                                <option value="">Miscellaneous (default)</option>
                                {PRODUCT_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{currency(r.price)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{currency(r.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <datalist id="vendor-import-new-vendors">
                    {vendorOptions.map((v) => <option key={v} value={v} />)}
                  </datalist>
                  <datalist id="vendor-import-new-sources">
                    {sourceOptions.map((v) => <option key={v} value={v} />)}
                  </datalist>

                  {newIssues && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      To add the checked products, choose a Technology above.
                    </p>
                  )}
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
                {addedCount > 0 && ` Added ${addedCount} new product${addedCount !== 1 ? 's' : ''}.`}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {step === 'review' && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                type="button"
                onClick={apply}
                disabled={applying || (matched.length === 0 && checkedNew.length === 0) || newIssues}
              >
                {applying
                  ? 'Applying…'
                  : checkedNew.length > 0
                    ? `Update ${matched.length} · Add ${checkedNew.length}`
                    : `Apply to ${matched.length} Product${matched.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
          {step === 'pick' && (
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          )}
          {step === 'map' && (
            <>
              <Button type="button" variant="outline" onClick={() => { setParseErrors([]); setStep('pick'); }}>
                Back
              </Button>
              <Button type="button" onClick={runImport} disabled={!mappingReady}>
                Continue
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button type="button" onClick={onClose}>Done</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
