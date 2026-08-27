'use client';

import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Card, Button, Field, TextInput, NumberInput, Select } from '@/components/ui/primitives';
import { PRODUCT_CATEGORIES } from '@/lib/catalog';
import { BUILTIN_TECHNOLOGIES, companyTechnologies } from '@/lib/technologies';
import { companyTechVendors } from '@/lib/vendors';
import { licenseCandidates, guessLicenses } from '@/lib/licenseMatch';
import { isAssembly, assemblyRollUp, normalizeComponents, productsBySku } from '@/lib/assemblies';
import { currency } from '@/lib/format';

const EMPTY = {
  sku: '', description: '', category: 'Access Point', technology: 'managed_wifi',
  cost: 0, price: 0, vendor: '', preferred_vendor: '', product_line: '', discount_pct: '',
  mount_type: '', quality_tier: '', port_count: '', poe_watts: '', poe_budget_watts: '',
  license_sku_1yr: '', license_sku_3yr: '', license_sku_5yr: '',
  components: [],
};

// Empty string in the form = "not set" → null in the database.
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const strOrNull = (v) => (v ? v : null);

// product === null → Add mode; otherwise Edit (SKU locked for base products).
// Empty license fields pre-fill from the catalog matcher (SKU + term markers)
// so linked licenses rarely need hand-picking; stored values always win.
function initialForm(product, defaultTechnology, allProducts) {
  if (!product) return { ...EMPTY, technology: defaultTechnology || EMPTY.technology };
  const guesses = guessLicenses(product, allProducts);
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
    discount_pct: product.discount_pct ?? '', // '' = no stored discount (distinct from 0%)
    mount_type: product.mount_type ?? '',
    quality_tier: product.quality_tier ?? '',
    port_count: product.port_count ?? '',
    poe_watts: product.poe_watts ?? '',
    poe_budget_watts: product.poe_budget_watts ?? '',
    license_sku_1yr: product.license_sku_1yr ?? guesses.license_sku_1yr ?? '',
    license_sku_3yr: product.license_sku_3yr ?? guesses.license_sku_3yr ?? '',
    license_sku_5yr: product.license_sku_5yr ?? guesses.license_sku_5yr ?? '',
    components: Array.isArray(product.components) ? product.components.map((c) => ({ ...c })) : [],
  };
}

// The modal is mounted only while open (see page.jsx), so initializing form
// state from `product` here resets it correctly each time it opens — no effect.
export default function ProductModal({ open, product, clone = false, onClose, onSave, company = null, defaultTechnology = '', allProducts = [], superAdmin = false }) {
  const [form, setForm] = useState(() => initialForm(product, defaultTechnology, allProducts));
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
  // SKUs are editable by the SUPER ADMIN only. Custom products truly rename
  // (with a proposal-migration offer); base/core products get a per-team
  // DISPLAY alias — the engines keep their identity, the team sees the new
  // number. Team admins can't touch SKUs (editing used to silently create
  // a duplicate product).
  const skuLocked = isEdit && !superAdmin;
  const skuRenaming = isEdit && !skuLocked && form.sku.trim() !== product.sku;
  const skuNote = !skuRenaming ? undefined
    : product.isCustom
      ? `Renaming from ${product.sku} — you'll be offered a list of proposals to update.`
      : `Base product: ${product.baseSku ?? product.sku} keeps working internally; this team's catalog and quotes will show the new SKU.`;
  const title = clone ? 'Clone Product' : isEdit ? 'Edit Product' : 'Add Product';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Kit mode (0067): with parts listed, cost and price are derived from
  // them — the roll-up shown here is what every quote will see.
  const kitComponents = normalizeComponents(form.components);
  const kitRollUp = kitComponents ? assemblyRollUp(kitComponents, productsBySku(allProducts)) : null;
  const partOptions = allProducts.filter((p) => !isAssembly(p) && p.sku !== form.sku);
  const setComponent = (i, patch) =>
    setForm((f) => ({ ...f, components: f.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const removeComponent = (i) => setForm((f) => ({ ...f, components: f.components.filter((_, j) => j !== i) }));
  const addComponent = () => setForm((f) => ({ ...f, components: [...f.components, { sku: '', qty: 1 }] }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        ...form,
        discount_pct: numOrNull(form.discount_pct),
        mount_type: strOrNull(form.mount_type),
        quality_tier: strOrNull(form.quality_tier),
        port_count: numOrNull(form.port_count),
        poe_watts: numOrNull(form.poe_watts),
        poe_budget_watts: numOrNull(form.poe_budget_watts),
        license_sku_1yr: strOrNull(form.license_sku_1yr.trim()),
        license_sku_3yr: strOrNull(form.license_sku_3yr.trim()),
        license_sku_5yr: strOrNull(form.license_sku_5yr.trim()),
        components: kitComponents,
        ...(kitRollUp ? { cost: kitRollUp.cost, price: kitRollUp.price } : {}),
      });
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
        className="max-h-[88vh] w-full max-w-md overflow-y-auto p-5"
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
          <Field label="SKU" sub={skuNote}>
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cost" sub={kitRollUp ? 'From parts' : undefined}>
              <NumberInput step="0.01" value={kitRollUp ? kitRollUp.cost : form.cost} onChange={(v) => set('cost', v)} disabled={!!kitRollUp} />
            </Field>
            <Field label="Price" sub={kitRollUp ? 'From parts' : undefined}>
              <NumberInput step="0.01" value={kitRollUp ? kitRollUp.price : form.price} onChange={(v) => set('price', v)} disabled={!!kitRollUp} />
            </Field>
            <Field label="Discount %">
              <TextInput
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.discount_pct}
                onChange={(e) => set('discount_pct', e.target.value)}
                placeholder="—"
              />
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-0.5 text-xs font-semibold text-slate-600">Kit parts</p>
            <p className="mb-2 text-[11px] text-slate-400">
              Optional — list the parts and this product becomes a kit: its cost and price roll up from them
              (live, as part prices change) and it quotes as one line.
            </p>
            {form.components.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {form.components.map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select className="h-8 min-w-0 flex-1 text-xs" value={c.sku} onChange={(e) => setComponent(i, { sku: e.target.value })}>
                      <option value="">Part…</option>
                      {partOptions.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.sku} — {p.desc}
                        </option>
                      ))}
                    </Select>
                    <TextInput type="number" min="0" step="1" className="h-8 w-16 text-right text-xs" value={c.qty} onChange={(e) => setComponent(i, { qty: e.target.value })} />
                    {(c.unitCost != null || c.unitPrice != null) && (
                      <span className="text-[10px] text-amber-700" title={c.note || 'Unit price pinned for this kit'}>pinned</span>
                    )}
                    <button type="button" onClick={() => removeComponent(i)} title="Remove part" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={addComponent}>+ Part</Button>
            {kitRollUp && (
              <p className="mt-2 text-xs text-slate-600">
                Rolls up to cost {currency(kitRollUp.cost)} · price {currency(kitRollUp.price)}
                {kitRollUp.missing.length > 0 && <span className="text-red-600"> · not in catalog: {kitRollUp.missing.join(', ')}</span>}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-0.5 text-xs font-semibold text-slate-600">System Builder attributes</p>
            <p className="mb-3 text-[11px] text-slate-400">
              Optional — the Managed Wi-Fi builder picks APs and switches by these tags
              (Deployment, Quality, License Term selectors).
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mount" sub="APs">
                  <Select value={form.mount_type} onChange={(e) => set('mount_type', e.target.value)}>
                    <option value="">—</option>
                    <option value="ceiling">On Ceiling</option>
                    <option value="wall">On Wall</option>
                    <option value="rack">Rack Mount</option>
                  </Select>
                </Field>
                <Field label="Quality">
                  <Select value={form.quality_tier} onChange={(e) => set('quality_tier', e.target.value)}>
                    <option value="">—</option>
                    <option value="better">Better</option>
                    <option value="best">Best</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Ports" sub="Switches">
                  <TextInput
                    type="number" min="0" step="1"
                    value={form.port_count}
                    onChange={(e) => set('port_count', e.target.value)}
                    placeholder="—"
                  />
                </Field>
                <Field label="PoE Draw (W)" sub="APs">
                  <TextInput
                    type="number" min="0" step="0.1"
                    value={form.poe_watts}
                    onChange={(e) => set('poe_watts', e.target.value)}
                    placeholder="—"
                  />
                </Field>
                <Field label="PoE Budget (W)" sub="Switches">
                  <TextInput
                    type="number" min="0" step="1"
                    value={form.poe_budget_watts}
                    onChange={(e) => set('poe_budget_watts', e.target.value)}
                    placeholder="—"
                  />
                </Field>
              </div>
              {(() => {
                const candidates = licenseCandidates(
                  { sku: form.sku, technology: form.technology },
                  allProducts
                );
                const candidateSkus = new Set(candidates.map((c) => c.sku));
                const licSelect = (key, label) => (
                  <Field label={label} sub="Linked SKU">
                    <Select value={form[key]} onChange={(e) => set(key, e.target.value)}>
                      <option value="">—</option>
                      {form[key] && !candidateSkus.has(form[key]) && (
                        <option value={form[key]}>{form[key]}</option>
                      )}
                      {candidates.map((c) => (
                        <option key={c.sku} value={c.sku} title={c.desc}>
                          {c.sku}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {licSelect('license_sku_1yr', 'License 1yr')}
                      {licSelect('license_sku_3yr', 'License 3yr')}
                      {licSelect('license_sku_5yr', 'License 5yr')}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-400">
                        Dropdowns list License/Subscription products for this technology —
                        matches mentioning this SKU are listed first.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const g = guessLicenses({ sku: form.sku, technology: form.technology }, allProducts);
                          setForm((f) => ({
                            ...f,
                            license_sku_1yr: g.license_sku_1yr ?? f.license_sku_1yr,
                            license_sku_3yr: g.license_sku_3yr ?? f.license_sku_3yr,
                            license_sku_5yr: g.license_sku_5yr ?? f.license_sku_5yr,
                          }));
                        }}
                        className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                      >
                        Auto-match
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
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
