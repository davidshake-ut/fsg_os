'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Wrench, Package } from 'lucide-react';
import { Card, Button, TextInput } from '@/components/ui/primitives';
import { currency } from '@/lib/format';

// Generic technology page — the quoting substrate for technologies without
// a bespoke calculator yet (Tier-2 mini-calculators layer on top of this).
// Pick SKUs from this technology's slice of the Product Database, set
// quantities, or add free-form lines; hardware and services render as
// separate sub-groups and roll into the quote via calculateTechBOM.

function LineRow({ line, canViewMargin, onUpdate, onRemove }) {
  const qty = Number(line.qty) || 0;
  const totalPrice = qty * (Number(line.price) || 0);
  const isCatalog = Boolean(line.fromCatalog);
  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">
        {isCatalog ? line.sku : (
          <input value={line.sku} onChange={(e) => onUpdate(line.id, 'sku', e.target.value)} placeholder="SKU"
            className="w-24 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs outline-none focus:border-blue-400" />
        )}
      </td>
      <td className="px-3 py-1.5 text-sm text-slate-700">
        {isCatalog ? line.description : (
          <input value={line.description} onChange={(e) => onUpdate(line.id, 'description', e.target.value)} placeholder="Description"
            className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-sm outline-none focus:border-blue-400" />
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        <input type="number" min="0" value={line.qty}
          onChange={(e) => onUpdate(line.id, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
          className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
      </td>
      {canViewMargin && (
        <td className="px-3 py-1.5 text-right">
          <input type="number" min="0" step="0.01" value={line.cost}
            onChange={(e) => onUpdate(line.id, 'cost', e.target.value === '' ? '' : Number(e.target.value))}
            className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
        </td>
      )}
      <td className="px-3 py-1.5 text-right">
        <input type="number" min="0" step="0.01" value={line.price}
          onChange={(e) => onUpdate(line.id, 'price', e.target.value === '' ? '' : Number(e.target.value))}
          className="w-24 rounded border border-slate-200 px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-blue-400" />
      </td>
      <td className="px-3 py-1.5 text-right text-sm font-medium tabular-nums text-slate-700">{currency(totalPrice)}</td>
      <td className="px-2 py-1.5 text-right">
        <button type="button" onClick={() => onRemove(line.id)} title="Remove line"
          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function LinesTable({ title, icon: Icon, lines, canViewMargin, onUpdate, onRemove, onAddCustom, addLabel, emptyHint }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Icon size={14} className="text-slate-400" /> {title}
          {lines.length > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{lines.length}</span>
          )}
        </h3>
        <Button variant="outline" size="sm" onClick={onAddCustom}><Plus size={13} /> {addLabel}</Button>
      </div>
      {lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{emptyHint}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                {canViewMargin && <th className="px-3 py-2 text-right font-medium">Unit Cost</th>}
                <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} canViewMargin={canViewMargin} onUpdate={onUpdate} onRemove={onRemove} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function TechnologyPage({
  techId,
  label,
  products = [],       // full merged catalog; filtered to this technology here
  lines = [],          // this tech's line entries (customLineItems, system === techId)
  bom,                 // calculateTechBOM output for the totals strip
  canViewMargin = false,
  onAddLine,           // (line) => void — page assigns id + system
  onUpdateLine,
  onRemoveLine,
}) {
  const [query, setQuery] = useState('');

  const techProducts = useMemo(
    () => products.filter((p) => (p.technology || 'managed_wifi') === techId),
    [products, techId]
  );
  const pickerResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return techProducts
      .filter((p) => p.sku.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
      .slice(0, 8);
  }, [techProducts, query]);

  const addFromCatalog = (p) => {
    onAddLine({
      sku: p.sku,
      description: p.desc,
      qty: 1,
      cost: p.cost,
      price: p.price,
      category: p.category,
      isService: p.category === 'Service',
      fromCatalog: true,
    });
    setQuery('');
  };

  const hardwareLines = lines.filter((l) => !(l.isService || l.category === 'Service'));
  const serviceLines = lines.filter((l) => l.isService || l.category === 'Service');

  return (
    <div className="space-y-4">
      {/* Add-from-catalog picker */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{label}</h2>
            <p className="text-xs text-slate-400">
              {techProducts.length > 0
                ? `${techProducts.length} catalog item${techProducts.length !== 1 ? 's' : ''} in this category — search to add, or use custom lines.`
                : 'No catalog items in this category yet — add them in the Product Database (Category = ' + label + '), or quote with custom lines below.'}
            </p>
          </div>
          {bom && (
            <div className="flex items-center gap-4 text-right">
              {canViewMargin && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Margin</p>
                  <p className="text-sm font-bold tabular-nums text-slate-700">{bom.overallMargin}%</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Section Total</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">{currency(bom.grandTotalPrice)}</p>
              </div>
            </div>
          )}
        </div>
        {techProducts.length > 0 && (
          <div className="relative mt-3 max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <TextInput className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label} products to add…`} />
            {pickerResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {pickerResults.map((p) => (
                  <button key={p.sku} type="button" onClick={() => addFromCatalog(p)}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-blue-50/60">
                    <span className="w-32 shrink-0 truncate font-mono text-xs text-slate-500">{p.sku}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.desc}</span>
                    <span className="shrink-0 text-xs text-slate-400">{p.category}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">{currency(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <LinesTable
        title="Hardware & Equipment"
        icon={Package}
        lines={hardwareLines}
        canViewMargin={canViewMargin}
        onUpdate={onUpdateLine}
        onRemove={onRemoveLine}
        addLabel="Custom line"
        onAddCustom={() => onAddLine({ sku: '', description: '', qty: 1, cost: 0, price: 0, category: 'Custom', isService: false, fromCatalog: false })}
        emptyHint="Nothing quoted yet — search the catalog above or add a custom line."
      />

      <LinesTable
        title="Services"
        icon={Wrench}
        lines={serviceLines}
        canViewMargin={canViewMargin}
        onUpdate={onUpdateLine}
        onRemove={onRemoveLine}
        addLabel="Custom service"
        onAddCustom={() => onAddLine({ sku: '', description: '', qty: 1, cost: 0, price: 0, category: 'Service', isService: true, fromCatalog: false })}
        emptyHint={`No services on this section — add ${label} service SKUs (Subcategory: Service) or a custom service.`}
      />
    </div>
  );
}
