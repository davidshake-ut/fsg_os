'use client';

import { useEffect, useState } from 'react';
import { Trash2, Upload, X, Wifi, Camera } from 'lucide-react';
import { Card, Button, Field, TextInput, NumberInput, Toggle } from '@/components/ui/primitives';

const MAX_LOGO_BYTES = 1_000_000; // ~1 MB — localStorage-friendly

function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  );
}

// Project Settings. The Technologies section (which systems this project bids on)
// is available to everyone and applies live — it persists with the project. The
// Branding section is global (one brand per install) and Admin-only.
export default function SettingsModal({
  branding,
  onSave,
  onClose,
  canManageBranding = false,
  includeWifi = true,
  includeCameras = true,
  includeShipping = true,
  shippingPercent = 7,
  onSetInput,
}) {
  const [form, setForm] = useState(() => ({ ...branding }));
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // key: 'logo' (dark artwork, light backgrounds) or 'logoLight' (light
  // artwork, dark banners) — see lib/colors.js pickLogo().
  const onLogoFor = (key) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file (PNG, JPG, SVG…).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') return;
      if (dataUrl.length > MAX_LOGO_BYTES * 1.37) {
        setErr('That logo is too large — keep it under ~1 MB (try a smaller PNG/JPG).');
        return;
      }
      const img = new Image();
      img.onload = () => {
        set(key, { dataUrl, w: img.naturalWidth || 200, h: img.naturalHeight || 80 });
        setErr(null);
      };
      img.onerror = () => setErr('Could not read that image.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  const onLogo = onLogoFor('logo');

  const noneEnabled = !includeWifi && !includeCameras;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <Card
        className="max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Technologies — per project, applies live */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Technologies</h3>
            <p className="text-xs text-slate-400">
              Choose which systems this project bids on. Hidden systems are removed from the tabs,
              totals, and exports. Saved with the project.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center gap-2">
              <Wifi size={15} className="text-slate-400" />
              <Toggle
                checked={includeWifi}
                onChange={(v) => onSetInput?.('includeWifi', v)}
                label="Managed Wi-Fi"
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Camera size={15} className="text-slate-400" />
              <Toggle
                checked={includeCameras}
                onChange={(v) => onSetInput?.('includeCameras', v)}
                label="Camera Systems"
              />
            </div>
          </div>

          {noneEnabled && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              No systems selected — enable at least one to build a quote.
            </p>
          )}
        </section>

        {/* Shipping — per project, applies live */}
        <section className="mt-5 space-y-3 border-t border-slate-100 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Shipping</h3>
            <p className="text-xs text-slate-400">
              Add an estimated shipping line as a percentage of the hardware total.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <Toggle
              checked={includeShipping}
              onChange={(v) => onSetInput?.('includeShipping', v)}
              label="Add Shipping"
            />
            {includeShipping && (
              <Field className="mt-3" label="Shipping (% of hardware)">
                <NumberInput
                  value={shippingPercent ?? 7}
                  onChange={(v) => onSetInput?.('shippingPercent', v)}
                />
              </Field>
            )}
          </div>
        </section>

        {/* Branding — global, Admin-only */}
        {canManageBranding && (
          <section className="mt-5 space-y-4 border-t border-slate-100 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Branding</h3>
              <p className="text-xs text-slate-400">
                Applied to the app header and PDF/CSV exports (one brand per install).
              </p>
            </div>

            <Field label="Company Name">
              <TextInput
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                placeholder="Acme Networks"
              />
            </Field>

            <Field label="Logo — Dark version" sub="Used on light backgrounds — app header, printed pages (keep under ~1 MB)">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                  {form.logo?.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.logo.dataUrl}
                      alt="Logo preview"
                      className="max-h-12 max-w-[6.5rem] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">No logo</span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                    <Upload size={14} /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                  </label>
                  {form.logo && (
                    <button
                      type="button"
                      onClick={() => set('logo', null)}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </Field>

            <Field label="Logo — Light version" sub="Used on dark backgrounds like the PDF banner — usually white artwork (optional)">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
                  {form.logoLight?.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.logoLight.dataUrl}
                      alt="Light logo preview"
                      className="max-h-12 max-w-[6.5rem] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-500">No light logo</span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                    <Upload size={14} /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoFor('logoLight')} />
                  </label>
                  {form.logoLight && (
                    <button
                      type="button"
                      onClick={() => set('logoLight', null)}
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary Color">
                <ColorInput value={form.primaryColor} onChange={(v) => set('primaryColor', v)} />
              </Field>
              <Field label="Accent Color">
                <ColorInput value={form.accentColor} onChange={(v) => set('accentColor', v)} />
              </Field>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
          </section>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {canManageBranding ? (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button size="sm" onClick={() => onSave(form)}>
                Save Branding
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
