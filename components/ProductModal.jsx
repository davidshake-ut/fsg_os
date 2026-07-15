'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Card, Button, Field, TextInput, NumberInput, Select } from '@/components/ui/primitives';
import { PRODUCT_CATEGORIES } from '@/lib/catalog';
import { BUILTIN_TECHNOLOGIES, companyTechnologies } from '@/lib/technologies';
import { companyTechVendors } from '@/lib/vendors';

const EMPTY = { sku: '', description: '', category: 'Access Point', technology: 'managed_wifi', cost: 0, price: 0, vendor: '', preferred_vendor: '', product_line: '' };

// product === null → Add mode; otherwise Edit (SKU locked for base products).
function initialForm(product, defaultTechnology) {
  if (!product) return { ...EMPTY, technology: defaultTechnology || EMPTY.technology };
  return {
    sku: product.sku,
    description: product.desc ?? product.description ?? '',
    category: product.category,
    technology: product.technology || 'managed_wifi',
    cost: product.cost,
    price: product.price,
    vendor: product.vendor ?? '',
    preferred_vendor: product.preferred_vendor ?? '',
    product_line: product.product_line ?? '',
  };
}

// The modal is mounted only while open (see page.jsx), so initializing form
// state from `product` here resets it correctly each time it opens — no effect.
export default function ProductModal({ open, product, clone = false, onClose, onSave, company = null, defaultTechnology = '' }) {
  const [form, setForm] = useState(() => initialForm(product, defaultTechnology));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // When the product's technology has registry vendors, Vendor renders as a
  // Select of those names; "Other…" (or a pre-existing non-registry value)
  // switches to free text so arbitrary manufacturers keep working.
  const [vendorFreeText, setVendorFreeText] = useState(() => {
    const v = product?.vendor ?? '';
    if (!v) return false;
    return !companyTechVendors(company, product?.technology || defaultTechnology || 'managed_wifi')
      .some((entry) => entry.name === v);
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  // Clone pre-fills from a product but saves as a NEW product (editable SKU).
  const isEdit = Boolean(product) && !clone;
  const skuLocked = isEdit && !product.isCustom; // base products keep their SKU
  const title = clone ? 'Clone Product' : isEdit ? 'Edit Product' : 'Add Product';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave(form);
      onClose();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <Card
        className="w-full max-w-md p-5"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="SKU">
            <TextInput value={form.sku} onChange={(e) => set('sku', e.target.value)} disabled={skuLocked} required />
          </Field>
          <Field label="Description">
            <TextInput value={form.description} onChange={(e) => set('description', e.target.value)} required />
          </Field>
          <Field label="Category" sub="Which technology this part belongs to">
            <Select value={form.technology} onChange={(e) => set('technology', e.target.value)}>
              {(company ? companyTechnologies(company) : BUILTIN_TECHNOLOGIES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" sub="What the part is — drives BOM grouping, equipment lists, and assets">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          {(() => {
            const registryVendors = companyTechVendors(company, form.technology).map((v) => v.name);
            const useSelect = registryVendors.length > 0 && !vendorFreeText;
            return (
              <Field label="Vendor" sub="Manufacturer — drives this technology's vendor tabs in the Builder">
                {useSelect ? (
                  <Select
                    value={registryVendors.includes(form.vendor) ? form.vendor : ''}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setVendorFreeText(true);
                        set('vendor', '');
                      } else {
                        set('vendor', e.target.value);
                      }
                    }}
                  >
                    <option value="">— none —</option>
                    {registryVendors.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                    <option value="__other__">Other…</option>
                  </Select>
                ) : (
                  <TextInput
                    value={form.vendor}
                    onChange={(e) => set('vendor', e.target.value)}
                    placeholder="e.g. Cambium Networks, Ruckus, Vertiv…"
                  />
                )}
              </Field>
            );
          })()}
          <Field label="Source / Distributor" sub="Where you buy it — groups future purchase orders">
            <TextInput value={form.preferred_vendor} onChange={(e) => set('preferred_vendor', e.target.value)} placeholder="e.g. Anixter, ScanSource, Graybar…" />
          </Field>
          <Field label="Product Line" sub="Drives automatic Cost calculation — see Settings → Pricing">
            <TextInput value={form.product_line} onChange={(e) => set('product_line', e.target.value)} placeholder="e.g. cnWave, Switches, AP's Indoor…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost">
              <NumberInput value={form.cost} onChange={(v) => set('cost', v)} />
            </Field>
            <Field label="Price">
              <NumberInput value={form.price} onChange={(v) => set('price', v)} />
            </Field>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
