'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { CATEGORY_ORDER } from '@/lib/catalog';
import { SEGMENT_ORDER, segmentOf } from '@/lib/segments';
import { currency, percent, marginColor } from '@/lib/format';
import { cn } from '@/lib/utils';

const SORTS = [
  { id: 'category', label: 'Category' },
  { id: 'priceDesc', label: 'Price: High → Low' },
  { id: 'priceAsc', label: 'Price: Low → High' },
  { id: 'name', label: 'Name: A → Z' },
];

const EDIT_INPUT =
  'h-7 w-24 rounded border border-slate-300 px-2 text-right text-xs tabular-nums text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

function sortItems(items, sortBy) {
  const arr = [...items];
  if (sortBy === 'priceDesc') return arr.sort((a, b) => b.totalPrice - a.totalPrice);
  if (sortBy === 'priceAsc') return arr.sort((a, b) => a.totalPrice - b.totalPrice);
  if (sortBy === 'name') return arr.sort((a, b) => (a.description || '').localeCompare(b.description || ''));
  return arr.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    const c = (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
    if (c !== 0) return c;
    return (a.description || '').localeCompare(b.description || '');
  });
}

function groupBySegment(items) {
  const map = new Map();
  for (const item of items) {
    const seg = item.segment || segmentOf(item.category);
    if (!map.has(seg)) map.set(seg, []);
    map.get(seg).push(item);
  }
  const ordered = [];
  for (const seg of SEGMENT_ORDER) if (map.has(seg)) ordered.push([seg, map.get(seg)]);
  for (const [seg, rows] of map) if (!SEGMENT_ORDER.includes(seg)) ordered.push([seg, rows]);
  return ordered;
}

const CUSTOM_INPUT =
  'h-7 rounded border border-slate-300 px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

export default function BOMTable({
  bom,
  showMargin,
  setShowMargin,
  priceOverrides = {},
  setPriceOverrides,
  editPrices = false,
  setEditPrices,
  canViewMargin = true,
  onAddCustom,
  onUpdateCustom,
  onRemoveCustom,
  onDiscard,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [hidden, setHidden] = useState(() => new Set());
  const [sortBy, setSortBy] = useState('category');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const groups = useMemo(() => groupBySegment(bom.items), [bom.items]);
  const segmentsPresent = useMemo(() => groups.map(([seg]) => seg), [groups]);

  // Editing sell price doesn't require seeing cost — a non-admin can still
  // discount a quote. canViewMargin only gates the cost/margin columns
  // themselves, regardless of showMargin/editPrices state.
  const editable = Boolean(setPriceOverrides);
  const showCost = canViewMargin && (showMargin || (editable && editPrices));

  const toggleCollapse = (seg) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(seg) ? next.delete(seg) : next.add(seg);
      return next;
    });

  const toggleHidden = (seg) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(seg) ? next.delete(seg) : next.add(seg);
      return next;
    });

  // Overrides are keyed by the line's ORIGINAL sku (baseSku) so editing the
  // displayed SKU doesn't orphan the row's other overrides.
  const keyOf = (line) => line.baseSku ?? line.sku;

  const setOverride = (line, field, value) =>
    setPriceOverrides((prev) => ({
      ...prev,
      [keyOf(line)]: {
        cost: prev[keyOf(line)]?.cost ?? line.unitCost,
        price: prev[keyOf(line)]?.price ?? line.unitPrice,
        ...prev[keyOf(line)],
        [field]: value,
      },
    }));

  // Deleting keeps the line's identity in the override (description for the
  // restore strip below the table).
  const removeLine = (line) =>
    setPriceOverrides((prev) => ({
      ...prev,
      [keyOf(line)]: {
        ...prev[keyOf(line)],
        description: prev[keyOf(line)]?.description ?? line.description,
        removed: true,
      },
    }));

  const restoreOne = (sku) =>
    setPriceOverrides((prev) => {
      const entry = { ...prev[sku] };
      delete entry.removed;
      return { ...prev, [sku]: entry };
    });

  const resetOne = (sku) =>
    setPriceOverrides((prev) => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });

  const removedLines = Object.entries(priceOverrides).filter(([, ov]) => ov?.removed);

  const visibleGroups = groups.filter(([seg]) => !hidden.has(seg));

  const editing = editable && editPrices;
  const colCount = (showCost ? 8 : 5) + (editing ? 1 : 0);
  const th = 'px-4 py-2.5 font-medium';
  const thNum = `${th} text-right whitespace-nowrap`;
  const td = 'px-4 py-2 whitespace-nowrap';
  const tdNum = `${td} text-right tabular-nums`;

  return (
    <div className="space-y-3">
      {/* Filter + sort toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {segmentsPresent.map((seg) => {
            const active = !hidden.has(seg);
            return (
              <button
                key={seg}
                type="button"
                onClick={() => toggleHidden(seg)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-400 line-through'
                )}
              >
                {seg}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {editable && editPrices && onDiscard && (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Undo2 size={13} /> Discard Changes
            </button>
          )}

          {editable && (
            <button
              type="button"
              role="switch"
              aria-checked={editPrices}
              onClick={() => setEditPrices?.((v) => !v)}
              title="Edit cost & price for this project only (does not change the catalog)"
              className="flex items-center gap-2 text-xs font-medium text-slate-600"
            >
              <span>Edit Line Items</span>
              <span
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                  editPrices ? 'bg-[var(--brand,#2563eb)]' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
                    editPrices ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </span>
            </button>
          )}

          {!editPrices && canViewMargin && (
            <Button variant="outline" size="sm" onClick={() => setShowMargin((s) => !s)}>
              {showMargin ? 'Hide Cost & Margin' : 'Show Cost & Margin'}
            </Button>
          )}
        </div>
      </div>

      {editPrices && (
        <p className="px-1 text-xs text-slate-400">
          Editing SKU, description, quantity, cost &amp; price for <strong>this project only</strong> —
          the product database is unchanged. Use ✕ to remove a line and the section + to add one.
          Slide off when done; values are kept and saved with the project.
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className={th}>SKU</th>
                <th className={th}>Description</th>
                <th className={thNum}>Qty</th>
                {showCost && <th className={thNum}>Unit Cost</th>}
                <th className={thNum}>Unit Price</th>
                {showCost && <th className={thNum}>Total Cost</th>}
                <th className={thNum}>Total Price</th>
                {showCost && <th className={thNum}>Margin</th>}
                {editing && <th className={th} aria-label="Actions" />}
              </tr>
            </thead>

            {visibleGroups.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-400">
                    No items — all segments are filtered out.
                  </td>
                </tr>
              </tbody>
            )}

            {visibleGroups.map(([seg, rows]) => {
              const subtotal = rows.reduce((s, r) => s + r.totalPrice, 0);
              const open = !collapsed.has(seg);
              const calcRows = sortItems(rows.filter((r) => !r.isCustomLine), sortBy);
              const customRows = rows.filter((r) => r.isCustomLine);
              return (
                <tbody key={seg}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 bg-slate-50 hover:bg-slate-100"
                    onClick={() => toggleCollapse(seg)}
                  >
                    <td colSpan={colCount} className="px-4 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          {seg}
                          <Badge className="border-slate-200 bg-white text-slate-500">
                            {rows.length}
                          </Badge>
                          {onAddCustom && (
                            <button
                              type="button"
                              title="Add a custom line item to this section"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCollapsed((prev) => {
                                  const n = new Set(prev);
                                  n.delete(seg);
                                  return n;
                                });
                                onAddCustom(seg);
                              }}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white hover:text-blue-600"
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-700">
                          {currency(subtotal)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {open && (
                    <>
                      {calcRows.map((r, i) => {
                        const overridden = Boolean(priceOverrides[keyOf(r)]);
                        return (
                        <tr
                          key={`${keyOf(r)}-${i}`}
                          className={cn(
                            'border-b border-slate-50 last:border-0',
                            overridden ? 'bg-orange-50/60' : 'hover:bg-slate-50/60'
                          )}
                        >
                          <td className={`${td} font-mono text-xs text-slate-500`}>
                            {editing ? (
                              <input
                                className={`${CUSTOM_INPUT} w-28 font-mono`}
                                value={r.sku}
                                onChange={(e) => setOverride(r, 'sku', e.target.value)}
                              />
                            ) : (
                              r.sku
                            )}
                          </td>
                          <td className="min-w-[14rem] px-4 py-2 text-slate-700">
                            {editing ? (
                              <input
                                className={`${CUSTOM_INPUT} w-full min-w-[12rem]`}
                                value={r.description}
                                onChange={(e) => setOverride(r, 'description', e.target.value)}
                              />
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <span>{r.description}</span>
                                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                  {r.category}
                                </span>
                              </span>
                            )}
                            {r.note && (
                              <span className="block text-xs italic text-slate-400">{r.note}</span>
                            )}
                          </td>
                          <td className={`${tdNum} text-slate-700`}>
                            {editing ? (
                              <input
                                type="number"
                                min="0"
                                className={`${EDIT_INPUT} w-16`}
                                value={r.qty}
                                onChange={(e) => setOverride(r, 'qty', Number(e.target.value))}
                              />
                            ) : (
                              r.qty
                            )}
                          </td>

                          {showCost && (
                            <td className={`${tdNum} text-slate-500`}>
                              {editPrices ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className={EDIT_INPUT}
                                  value={r.unitCost}
                                  onChange={(e) => setOverride(r, 'cost', Number(e.target.value))}
                                />
                              ) : (
                                currency(r.unitCost)
                              )}
                            </td>
                          )}

                          <td className={`${tdNum} text-slate-700`}>
                            {editPrices ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={EDIT_INPUT}
                                value={r.unitPrice}
                                onChange={(e) => setOverride(r, 'price', Number(e.target.value))}
                              />
                            ) : (
                              currency(r.unitPrice)
                            )}
                          </td>

                          {showCost && (
                            <td className={`${tdNum} text-slate-500`}>{currency(r.totalCost)}</td>
                          )}
                          <td className={`${tdNum} font-medium text-slate-700`}>
                            {currency(r.totalPrice)}
                          </td>
                          {showCost && (
                            <td className={`${td} text-right`}>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${marginColor(r.margin)}`}
                              >
                                {percent(r.margin, 0)}
                              </span>
                            </td>
                          )}
                          {editing && (
                            <td className={`${td} text-right`}>
                              <div className="flex items-center justify-end gap-0.5">
                                {overridden && (
                                  <button
                                    type="button"
                                    title="Reset this line to the calculated values"
                                    onClick={() => resetOne(keyOf(r))}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <RotateCcw size={13} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Remove this line from the quote"
                                  onClick={() => removeLine(r)}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        );
                      })}

                      {customRows.map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 bg-blue-50/40">
                          <td colSpan={colCount} className="px-4 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="shrink-0 rounded bg-[var(--brand,#2563eb)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--brand-text,#fff)]">
                                Custom
                              </span>
                              <input
                                value={r.sku}
                                onChange={(e) => onUpdateCustom(r.id, 'sku', e.target.value)}
                                placeholder="SKU"
                                className={`${CUSTOM_INPUT} w-28 font-mono`}
                              />
                              <input
                                value={r.description}
                                onChange={(e) => onUpdateCustom(r.id, 'description', e.target.value)}
                                placeholder="Description"
                                className={`${CUSTOM_INPUT} min-w-[10rem] flex-1`}
                              />
                              <label className="flex items-center gap-1 text-xs text-slate-500">
                                Qty
                                <input
                                  type="number"
                                  min="0"
                                  value={r.qty}
                                  onChange={(e) => onUpdateCustom(r.id, 'qty', Number(e.target.value))}
                                  className={`${CUSTOM_INPUT} w-16 text-right tabular-nums`}
                                />
                              </label>
                              {canViewMargin && (
                                <label className="flex items-center gap-1 text-xs text-slate-500">
                                  Cost
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={r.unitCost}
                                    onChange={(e) => onUpdateCustom(r.id, 'cost', Number(e.target.value))}
                                    className={`${CUSTOM_INPUT} w-24 text-right tabular-nums`}
                                  />
                                </label>
                              )}
                              <label className="flex items-center gap-1 text-xs text-slate-500">
                                Price
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={r.unitPrice}
                                  onChange={(e) => onUpdateCustom(r.id, 'price', Number(e.target.value))}
                                  className={`${CUSTOM_INPUT} w-24 text-right tabular-nums`}
                                />
                              </label>
                              <span className="ml-auto text-sm font-medium tabular-nums text-slate-700">
                                {currency(r.totalPrice)}
                              </span>
                              <button
                                type="button"
                                title="Remove line item"
                                onClick={() => onRemoveCustom(r.id)}
                                className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      </Card>

      <ConfirmModal
        open={confirmDiscard}
        title="Discard changes"
        message="Are you sure you want to discard changes? Every line returns to its last saved state (or the calculated values if this proposal hasn't been saved). This can't be undone."
        confirmLabel="Discard Changes"
        onConfirm={() => {
          onDiscard?.();
          setConfirmDiscard(false);
          setEditPrices?.(false);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      {editing && removedLines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2">
          <span className="text-xs font-medium text-slate-500">Removed from this quote:</span>
          {removedLines.map(([sku, ov]) => (
            <button
              key={sku}
              type="button"
              title="Restore this line"
              onClick={() => restoreOne(sku)}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
            >
              <RotateCcw size={11} /> {ov.description || sku}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
