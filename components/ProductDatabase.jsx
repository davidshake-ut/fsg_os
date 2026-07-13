'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Copy,
  Download,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, Button, Badge, TextInput } from '@/components/ui/primitives';
import { CORE_SKUS, CATEGORY_ORDER } from '@/lib/catalog';
import { companyTechnologies, techLabel } from '@/lib/technologies';
import { parseCatalogCSV } from '@/lib/csv';
import { exportCatalogCSV } from '@/lib/exportCSV';
import { currency } from '@/lib/format';
import VendorPriceImportModal from '@/components/VendorPriceImportModal';

export default function ProductDatabase({
  allProducts,
  onAdd,
  onEdit,
  onClone,
  onDelete,
  onImport,
  onBulkUpdate,
  productLineDiscounts = {},
  canManageCatalog = false,
  canViewMargin = true,
  company = null, // resolves custom-technology labels
  teams = null, // super-admin only: [{ id, name }] to enable the team filter
  teamFilter = 'all',
  onTeamFilterChange,
}) {
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState(null); // 'sku' | 'desc' | 'category' | 'technology'
  const [sortDir, setSortDir] = useState('asc');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'error'|'success', message: string }
  const [vendorImportOpen, setVendorImportOpen] = useState(false);
  const fileRef = useRef(null);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const { products, errors } = parseCatalogCSV(text, { technologies: companyTechnologies(company) });
      if (products.length === 0) {
        setNotice({ type: 'error', message: `No products imported. ${errors.join(' ') || 'No valid rows found.'}` });
        return;
      }
      const res = await onImport(products);
      const summary = `Imported ${products.length} row(s): ${res.added} added, ${res.updated} updated.`;
      setNotice({
        type: errors.length ? 'error' : 'success',
        message: errors.length ? `${summary} Skipped ${errors.length} row(s): ${errors.join(' ')}` : summary,
      });
    } catch (err) {
      setNotice({ type: 'error', message: `Import failed: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  // Categories present, in CATEGORY_ORDER (for the filter dropdown).
  const categories = useMemo(() => {
    const present = [...new Set(allProducts.map((p) => p.category))];
    return present.sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [allProducts]);

  const labelOf = (p) => techLabel(p.technology || 'managed_wifi', company);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allProducts;
    if (q) {
      list = list.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          labelOf(p).toLowerCase().includes(q)
      );
    }
    if (techFilter) list = list.filter((p) => (p.technology || 'managed_wifi') === techFilter);
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      const val = (p) => (sortKey === 'desc' ? p.desc : sortKey === 'technology' ? labelOf(p) : p[sortKey]) || '';
      list = [...list].sort(
        (a, b) => dir * val(a).localeCompare(val(b), undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, search, techFilter, categoryFilter, sortKey, sortDir, company]);

  const sortHeader = (key, label, align = 'left') => (
    <th className={`px-4 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 transition-colors hover:text-slate-600"
      >
        {label}
        {sortKey === key ? (
          sortDir === 'asc' ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-slate-300" />
        )}
      </button>
    </th>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <TextInput
              className="h-9 w-60 pl-8"
              placeholder="Search SKU, description, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Categories</option>
            {companyTechnologies(company).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Subcategories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {teams && teams.length > 0 && (
            <select
              value={teamFilter}
              onChange={(e) => onTeamFilterChange?.(e.target.value)}
              title="Filter the catalog by team"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCatalogCSV(allProducts, { includeCost: canViewMargin, techLabelOf: labelOf })}>
            <Download size={14} /> Export CSV
          </Button>
          {canManageCatalog && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> {importing ? 'Importing…' : 'Import CSV'}
              </Button>
              {onBulkUpdate && (
                <Button variant="outline" size="sm" onClick={() => setVendorImportOpen(true)}>
                  <Upload size={14} /> Update Prices from Vendor List
                </Button>
              )}
              <Button size="sm" onClick={onAdd}>
                Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className={`flex items-start justify-between gap-3 px-4 py-3 text-sm border-b ${notice.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          <span className="flex-1">{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              {sortHeader('sku', 'SKU')}
              {sortHeader('desc', 'Description')}
              {sortHeader('technology', 'Category')}
              {sortHeader('category', 'Subcategory')}
              <th className="px-4 py-2 text-left font-medium">Product Line</th>
              {canViewMargin && <th className="px-4 py-2 text-right font-medium">Cost</th>}
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  No products match the current search/filter.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.sku} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {p.sku}
                  {p.isCustom && (
                    <Badge className="ml-1 border-purple-200 bg-purple-50 text-purple-600">custom</Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="text-slate-700">{p.desc}</div>
                  {p.vendor && <div className="mt-0.5 text-xs text-slate-400">{p.vendor}</div>}
                  {p.preferred_vendor && (
                    <div className="mt-0.5 text-xs text-slate-400">via {p.preferred_vendor}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <Badge className="border-indigo-200 bg-indigo-50 text-indigo-600">{labelOf(p)}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge className="border-slate-200 bg-slate-50 text-slate-500">{p.category}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-500">{p.product_line || <span className="text-slate-300">—</span>}</td>
                {canViewMargin && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{currency(p.cost)}</td>}
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">{currency(p.price)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {canManageCatalog && (
                      <>
                        <button
                          title="Edit product (changes the catalog)"
                          onClick={() => onEdit?.(p)}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Clone product (create a copy)"
                          onClick={() => onClone?.(p)}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          title={
                            CORE_SKUS.has(p.sku)
                              ? 'Core product — cannot be deleted'
                              : 'Delete product'
                          }
                          onClick={() => onDelete?.(p)}
                          disabled={CORE_SKUS.has(p.sku)}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        These are the <strong>catalog</strong> cost/price. Edit a product (pencil), Add, Delete, or
        Import to change the product database for all projects. To adjust pricing for{' '}
        <strong>one project only</strong>, use <strong>Edit Prices</strong> on the Managed Wi-Fi or
        Camera Systems BOM — those edits don&apos;t change the catalog.
      </p>

      {vendorImportOpen && (
        <VendorPriceImportModal
          allProducts={allProducts}
          productLineDiscounts={productLineDiscounts}
          onApply={onBulkUpdate}
          onClose={() => setVendorImportOpen(false)}
        />
      )}
    </Card>
  );
}
