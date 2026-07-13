'use client';

import { Card, Field, NumberInput, Select, Toggle } from '@/components/ui/primitives';
import {
  SMART_APARTMENT_DEVICES,
  SMART_APARTMENT_DEFAULTS,
  computeSmartApartmentLines,
  smartApartmentLaborHours,
} from '@/lib/smartApartmentCalc';

// Smart Apartment IoT mini-calculator — the first framework-native one.
// Left rail: device counts + which catalog product each device type uses
// (Product Database, Category = Smart Apartment IoT) + the electrician
// toggle for lights labor. Math lives in lib/smartApartmentCalc.js.

function Section({ title, children }) {
  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function InputPanel({ value, onChange, products }) {
  const techProducts = products.filter((p) => (p.technology || 'managed_wifi') === 'smart_apartment');
  const totalDevices = SMART_APARTMENT_DEVICES.reduce((s, d) => s + Math.max(0, Number(value[d.key]) || 0), 0);
  const totalHours = smartApartmentLaborHours(value)['install-tech'];

  return (
    <div className="space-y-3">
      <Section title="Devices">
        {SMART_APARTMENT_DEVICES.map((d) => (
          <div key={d.key} className="space-y-1.5">
            <Field label={d.label} sub={`${d.hoursEach} hr install each`}>
              <NumberInput value={value[d.key]} onChange={(v) => onChange({ [d.key]: v })} />
            </Field>
            <Select value={value[d.skuKey] ?? ''} onChange={(e) => onChange({ [d.skuKey]: e.target.value })}>
              <option value="">Product: none selected</option>
              {techProducts.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.desc}
                </option>
              ))}
            </Select>
            {d.byOthersKey && (
              <Toggle
                checked={!!value[d.byOthersKey]}
                onChange={(v) => onChange({ [d.byOthersKey]: v })}
                label="Installed by electrician (exclude labor)"
              />
            )}
          </div>
        ))}
        {techProducts.length === 0 && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            No Smart Apartment IoT products in the catalog yet — add them in the Product
            Database (Category = Smart Apartment IoT) to attach hardware pricing. Device
            labor estimates work either way.
          </p>
        )}
      </Section>

      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Devices</span>
          <span className="font-semibold tabular-nums text-slate-800">{totalDevices}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-slate-500">Install labor</span>
          <span className="font-semibold tabular-nums text-slate-800">{totalHours} hrs</span>
        </div>
      </Card>
    </div>
  );
}

export const smartApartmentCalculator = {
  techId: 'smart_apartment',
  defaults: SMART_APARTMENT_DEFAULTS,
  InputPanel,
  compute: (value, { products }) => computeSmartApartmentLines(value, products),
  laborHours: (value) => smartApartmentLaborHours(value),
};
