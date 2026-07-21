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
import { Card, Button, Badge, TextInput, Select, Field } from '@/components/ui/primitives';
import { CORE_SKUS, CATEGORY_ORDER, PRODUCT_CATEGORIES } from '@/lib/catalog';
import { companyTechnologies, techLabel } from '@/lib/technologies';
import { parseCatalogCSV } from '@/lib/csv';
import { exportCatalogCSV } from '@/lib/exportCSV';
import { currency } from '@/lib/format';
import VendorPriceImportModal from '@/components/VendorPriceImportModal';

// One bulk-edit field: a Select over the known values, with "Leave
// unchanged" as the resting state, an optional free-text "Other…", and an
// optional "— clear —". Only fields moved off "Leave unchanged" apply.
function BulkField({ label, options, value, other, onChange, onOtherChange, allowOther = false, allowClear = false }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Select className="flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— leave unchanged —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {allowOther && <option value="__other__">Other…</option>}
          {allowClear && <option value="__clear__">— clear —</option>}
        </Select>
        {value === '__other__' && (
          <TextInput
            className="flex-1"
            value={other}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="New value"
            autoFocus
          />
        )}
      </div>
    </Field>
  );
}

function BulkEditModal({ count, company, allProducts, busy, onApply, onDelete, onClose }) {
  const [fields, setFields] = useState({
    technology: '',
    category: '',
    vendor: '',
    preferred_vendor: '',
    product_line: '',
    mount_type: '',
    quality_tier: '',
  });
  const [others, setOthers] = useState({ vendor: '', preferred_vendor: '', product_line: '' });
  const [mode, setMode] = useState('edit'); // 'edit' | 'confirm-delete'
  const [confirmText, setConfirmText] = useState('');
  const set = (k) => (v) => setFields((f) => ({ ...f, [k]: v }));
  const setOther = (k) => (v) => setOthers((o) => ({ ...o, [k]: v }));

  const distinct = (get) => [...new Set(allProducts.map(get).filter(Boolean))].sort();
  const registryNames = [
    ...new Set(Object.values(company?.settings?.technologyVendors ?? {}).flat().map((v) => v?.name).filter(Boolean)),
  ];
  const vendorOptions = [...new Set([...distinct((p) => p.vendor), ...registryNames])].sort();

  const resolve = (k) => {
    const v = fields[k];
    if (v === '') return undefined;
    if (v === '__clear__') return '';
    if (v === '__other__') return others[k]?.trim() || undefined;
    return v;
  };
  const patch = Object.fromEntries(
    ['technology', 'category', 'vendor', 'preferred_vendor', 'product_line', 'mount_type', 'quality_tier']
      .map((k) => [k, resolve(k)])
      .filter(([, v]) => v !== undefined)
  );
  const dirty = Object.keys(patch).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <Card className="w-full max-w-md p-5" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        {mode === 'confirm-delete' ? (
          <>
            <h3 className="mb-1 text-sm font-semibold text-red-700">
              Delete {count} product{count !== 1 ? 's' : ''}?
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              This permanently removes the selected product{count !== 1 ? 's' : ''} from your catalog.
              Saved quotes keep their snapshots, but the part{count !== 1 ? 's' : ''} disappear from
              pickers, imports, and the Builder. Core products the calculators depend on are skipped
              automatically.
            </p>
            <p className="mb-2 text-xs font-semibold text-red-600">
              Type DELETE to confirm.
            </p>
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setMode('edit'); setConfirmText(''); }}>
                Back
              </Button>
              <Button
                type="button"
                variant="danger"
                className="disabled:opacity-50"
                disabled={confirmText !== 'DELETE' || busy}
                onClick={() => onDelete()}
              >
                {busy ? 'Deleting…' : `Delete ${count}`}
              </Button>
            </div>
          </>
        ) : (
        <>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          Bulk edit {count} product{count !== 1 ? 's' : ''}
        </h3>
        <p className="mb-4 text-xs text-slate-400">
          Only the fields you change apply to every selected product — everything else keeps its current value.
        </p>
        <div className="space-y-3">
          <BulkField
            label="Category (technology)"
            options={companyTechnologies(company).map((t) => ({ value: t.id, label: t.label }))}
            value={fields.technology}
            onChange={set('technology')}
          />
          <BulkField
            label="Subcategory"
            options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={fields.category}
            onChange={set('category')}
          />
          <BulkField
            label="Vendor"
            options={vendorOptions.map((v) => ({ value: v, label: v }))}
            value={fields.vendor}
            other={others.vendor}
            onChange={set('vendor')}
            onOtherChange={setOther('vendor')}
            allowOther
            allowClear
          />
          <BulkField
            label="Source / Distributor"
            options={distinct((p) => p.preferred_vendor).map((v) => ({ value: v, label: v }))}
            value={fields.preferred_vendor}
            other={others.preferred_vendor}
            onChange={set('preferred_vendor')}
            onOtherChange={setOther('preferred_vendor')}
            allowOther
            allowClear
          />
          <BulkField
            label="Product Line"
            options={distinct((p) => p.product_line).map((v) => ({ value: v, label: v }))}
            value={fields.product_line}
            other={others.product_line}
            onChange={set('product_line')}
            onOtherChange={setOther('product_line')}
            allowOther
            allowClear
          />
          <BulkField
            label="Mount (APs)"
            options={[
              { value: 'ceiling', label: 'On Ceiling' },
              { value: 'wall', label: 'On Wall' },
            ]}
            value={fields.mount_type}
            onChange={set('mount_type')}
            allowClear
          />
          <BulkField
            label="Quality (APs & Switches)"
            options={[
              { value: 'better', label: 'Better' },
              { value: 'best', label: 'Best' },
            ]}
            value={fields.quality_tier}
            onChange={set('quality_tier')}
            allowClear
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="!text-red-600 hover:!bg-red-50"
              onClick={() => setMode('confirm-delete')}
            >
              <Trash2 size={14} /> Delete…
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!dirty || busy} onClick={() => onApply(patch)}>
              {busy ? 'Applying…' : `Apply to ${count}`}
            </Button>
          </div>
        </div>
        </>
        )}
      </Card>
    </div>
  );
}

export default function ProductDatabase({
  allProducts,
  onAdd,
  onEdit,
  onClone,
  onDelete,
  onImport,
  onBulkUpdate,
  onBulkDelete, // (sku) => Promise — direct delete, no per-item confirm (the modal's typed DELETE covers it)
  productLineDiscounts = {},
  canManageCatalog = false,
  canViewMargin = true,
  company = null, // resolves custom-technology labels
  initialTechFilter = '', // per-tech sub pages preset this (remount via key)
  initialVendorFilter = '', // vendor tabs preset this (remount via key)
  teams = null, // super-admin only: [{ id, name }] to enable the team filter
  teamFilter = 'all',
  onTeamFilterChange,
}) {
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState(initialTechFilter);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState(initialVendorFilter);
  const [sourceFilter, setSourceFilter] = useState('');
  const [sortKey, setSortKey] = useState(null); // 'sku' | 'desc' | 'category' | 'technology'
  const [sortDir, setSortDir] = useState('asc');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'error'|'success', message: string }
  const [vendorImportOpen, setVendorImportOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // SKUs picked for bulk edit
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef(null);

  const bulkable = canManageCatalog && !!onBulkUpdate;

  const toggleSelected = (sku) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });

  const applyBulk = async (patch) => {
    setBulkBusy(true);
    try {
      const rows = allProducts
        .filter((p) => selected.has(p.sku))
        .map((p) => ({
          sku: p.sku,
          description: p.desc,
          category: patch.category ?? p.category,
          technology: patch.technology ?? (p.technology ?? ''),
          cost: p.cost,
          price: p.price,
          vendor: patch.vendor !== undefined ? patch.vendor : (p.vendor ?? ''),
          preferred_vendor:
            patch.preferred_vendor !== undefined ? patch.preferred_vendor : (p.preferred_vendor ?? ''),
          product_line: patch.product_line !== undefined ? patch.product_line : (p.product_line ?? ''),
          ...(patch.mount_type !== undefined ? { mount_type: patch.mount_type || null } : {}),
          ...(patch.quality_tier !== undefined ? { quality_tier: patch.quality_tier || null } : {}),
        }));
      const res = await onBulkUpdate(rows);
      setNotice({
        type: 'success',
        message: `Updated ${res?.updated ?? rows.length} product${rows.length !== 1 ? 's' : ''}.`,
      });
      setSelected(new Set());
      setBulkOpen(false);
    } catch (err) {
      setNotice({ type: 'error', message: `Bulk edit failed: ${err.message}` });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      const skus = [...selected].filter((s) => !CORE_SKUS.has(s));
      const skippedCore = selected.size - skus.length;
      const failures = [];
      for (const sku of skus) {
        try {
          await onBulkDelete(sku);
        } catch (err) {
          failures.push(`${sku}: ${err.message}`);
        }
      }
      const deleted = skus.length - failures.length;
      const bits = [`Deleted ${deleted} product${deleted !== 1 ? 's' : ''}.`];
      if (skippedCore > 0) bits.push(`Skipped ${skippedCore} core product${skippedCore !== 1 ? 's' : ''}.`);
      if (failures.length > 0) {
        bits.push(`${failures.length} failed — ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}`);
      }
      setNotice({ type: failures.length > 0 ? 'error' : 'success', message: bits.join(' ') });
      setSelected(new Set());
      setBulkOpen(false);
    } finally {
      setBulkBusy(false);
    }
  };

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

  // Distinct vendor / source values present in the catalog (filter options).
  // The ACTIVE filter value is always included even when no product carries
  // it (e.g. a vendor-tab preset before any products are tagged) — otherwise
  // the select can't display it and silently filters everything out while
  // showing "All Vendors".
  const vendors = useMemo(() => {
    const set = new Set(allProducts.map((p) => p.vendor).filter(Boolean));
    if (vendorFilter) set.add(vendorFilter);
    return [...set].sort();
  }, [allProducts, vendorFilter]);
  const sources = useMemo(() => {
    const set = new Set(allProducts.map((p) => p.preferred_vendor).filter(Boolean));
    if (sourceFilter) set.add(sourceFilter);
    return [...set].sort();
  }, [allProducts, sourceFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allProducts;
    if (q) {
      list = list.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.vendor || '').toLowerCase().includes(q) ||
          labelOf(p).toLowerCase().includes(q)
      );
    }
    if (techFilter) list = list.filter((p) => (p.technology || 'managed_wifi') === techFilter);
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    if (vendorFilter) list = list.filter((p) => p.vendor === vendorFilter);
    if (sourceFilter) list = list.filter((p) => p.preferred_vendor === sourceFilter);
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      const val = (p) => (sortKey === 'desc' ? p.desc : sortKey === 'technology' ? labelOf(p) : p[sortKey]) || '';
      list = [...list].sort(
        (a, b) => dir * val(a).localeCompare(val(b), undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts, search, techFilter, categoryFilter, vendorFilter, sourceFilter, sortKey, sortDir, company]);

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
          {vendors.length > 0 && (
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {sources.length > 0 && (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
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
          {bulkable && selected.size > 0 && (
            <>
              <Button size="sm" onClick={() => setBulkOpen(true)}>
                <Pencil size={14} /> Bulk Edit ({selected.size})
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </>
          )}
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
              {bulkable && (
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    title="Select all filtered products"
                    checked={filtered.length > 0 && filtered.every((p) => selected.has(p.sku))}
                    onChange={() =>
                      setSelected((prev) => {
                        const all = filtered.every((p) => prev.has(p.sku));
                        const next = new Set(prev);
                        for (const p of filtered) {
                          if (all) next.delete(p.sku);
                          else next.add(p.sku);
                        }
                        return next;
                      })
                    }
                  />
                </th>
              )}
              {sortHeader('sku', 'SKU')}
              {sortHeader('desc', 'Description')}
              {sortHeader('technology', 'Category')}
              {sortHeader('category', 'Subcategory')}
              {sortHeader('vendor', 'Vendor')}
              {sortHeader('preferred_vendor', 'Source / Distributor')}
              <th className="px-4 py-2 text-left font-medium">Product Line</th>
              {canViewMargin && <th className="px-4 py-2 text-right font-medium">Cost</th>}
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={bulkable ? 11 : 10} className="px-4 py-8 text-center text-sm text-slate-400">
                  No products match the current search/filter.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.sku} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                {bulkable && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.sku)}
                      onChange={() => toggleSelected(p.sku)}
                    />
                  </td>
                )}
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {p.sku}
                  {p.isCustom && (
                    <Badge className="ml-1 border-purple-200 bg-purple-50 text-purple-600">custom</Badge>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="text-slate-700">{p.desc}</div>
                </td>
                <td className="px-4 py-2">
                  <Badge className="border-indigo-200 bg-indigo-50 text-indigo-600">{labelOf(p)}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge className="border-slate-200 bg-slate-50 text-slate-500">{p.category}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-600">{p.vendor || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2 text-slate-500">{p.preferred_vendor || <span className="text-slate-300">—</span>}</td>
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
          company={company}
          onApply={onBulkUpdate}
          onClose={() => setVendorImportOpen(false)}
        />
      )}
      {bulkOpen && (
        <BulkEditModal
          count={selected.size}
          company={company}
          allProducts={allProducts}
          busy={bulkBusy}
          onApply={applyBulk}
          onDelete={onBulkDelete ? bulkDelete : undefined}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </Card>
  );
}
