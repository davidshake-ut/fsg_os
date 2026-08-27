'use client';

import { Building2, AlertTriangle } from 'lucide-react';
import { Card, Field, NumberInput, Select, Segmented, Toggle } from '@/components/ui/primitives';
import { WIFI_TAKEOFF_DEFAULTS, apsForClass, buildWifiTakeoff, unitClassesPresent, propertyModelHasUnits } from '@/lib/wifiTakeoff';
import { normalizePropertyModel, propertyTotals, unitClassLabel } from '@/lib/propertyModel';

// Wi-Fi rail, top section: where the design comes from. "Rooms & ratio"
// is the classic engine; "Property model" designs from the Digital
// Infrastructure property (unit schedule, telecom rooms, named locations)
// with per-class coverage rules. Settings persist at inputs.wifiTakeoff.

function Section({ title, children }) {
  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export default function WifiTakeoffPanel({ inputs, setInputs, products = [] }) {
  const modelRaw = inputs.techCalc?.digital_infrastructure;
  const hasUnits = propertyModelHasUnits(modelRaw);
  const settings = { ...WIFI_TAKEOFF_DEFAULTS, ...(inputs.wifiTakeoff ?? {}) };
  const enabled = !!settings.enabled && hasUnits;

  const setTakeoff = (patch) =>
    setInputs((prev) => ({
      ...prev,
      wifiTakeoff: { ...WIFI_TAKEOFF_DEFAULTS, ...(prev.wifiTakeoff ?? {}), ...patch },
    }));

  const model = normalizePropertyModel(modelRaw);
  const totals = propertyTotals(model);
  const classes = unitClassesPresent(model);
  const takeoff = enabled ? buildWifiTakeoff(model, settings) : null;
  const switchProducts = products.filter(
    (p) => (p.technology || 'managed_wifi') === 'managed_wifi' && p.category === 'Switch'
  );

  return (
    <Section title="Design Source">
      <Segmented
        value={enabled ? 'property' : 'simple'}
        onChange={(v) => setTakeoff({ enabled: v === 'property' })}
        options={[
          { value: 'simple', label: 'Rooms & ratio' },
          { value: 'property', label: 'Property model', disabled: !hasUnits },
        ]}
      />
      {!hasUnits && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <Building2 size={12} className="mt-0.5 shrink-0 text-slate-400" />
          Enable Digital Infrastructure on the Overview and import the unit schedule to design Wi-Fi from the property itself.
        </p>
      )}

      {enabled && takeoff && (
        <>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-600">Coverage — APs per unit</p>
            {classes.map((cls) => (
              <Field key={cls} label={`${unitClassLabel(cls)} · ${totals.byClass[cls]} unit${totals.byClass[cls] === 1 ? '' : 's'}`}>
                <NumberInput
                  value={apsForClass(settings, cls)}
                  onChange={(v) => setTakeoff({ apsPerClass: { ...settings.apsPerClass, [cls]: v } })}
                />
              </Field>
            ))}
          </div>

          <Field label="Spare switch ports" sub="Percent of APs held open per closet (the takeoff's 20%)">
            <NumberInput value={settings.portOverheadPct} onChange={(v) => setTakeoff({ portOverheadPct: v })} />
          </Field>

          {classes.includes('th') && (
            <Toggle
              checked={settings.switchPerTownhome}
              onChange={(v) => setTakeoff({ switchPerTownhome: v })}
              label="One small PoE switch per townhome"
            />
          )}

          <Toggle
            checked={settings.inUnitSwitchForMultiAp}
            onChange={(v) => setTakeoff({ inUnitSwitchForMultiAp: v })}
            label="In-unit switch for units with 2+ APs"
          />
          {settings.inUnitSwitchForMultiAp && (
            <Select value={settings.inUnitSwitchSku} onChange={(e) => setTakeoff({ inUnitSwitchSku: e.target.value })}>
              <option value="">In-unit switch: count only (no product yet)</option>
              {switchProducts.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.desc}
                </option>
              ))}
            </Select>
          )}

          <Toggle
            checked={settings.useLocationLists}
            onChange={(v) => setTakeoff({ useLocationLists: v })}
            label="Amenity & outdoor APs from the property's lists"
          />

          <Card className="space-y-1 p-3 text-sm">
            {[
              ['Unit APs', takeoff.unitAPs],
              ['Units with 2+ APs', takeoff.multiApUnits],
              ...(takeoff.townhomeUnits ? [['Townhomes', takeoff.townhomeUnits]] : []),
              ['Telecom rooms', `${takeoff.rooms.length}${takeoff.rooms.some((r) => r.isMdf) ? ' (1 MDF)' : ''}`],
              ...(takeoff.amenityAPs != null ? [['Amenity APs', takeoff.amenityAPs], ['Outdoor APs', takeoff.outdoorAPs]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold tabular-nums text-slate-800">{value}</span>
              </div>
            ))}
          </Card>

          {takeoff.unassignedLevelIds.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {takeoff.unassignedLevelIds.length} level{takeoff.unassignedLevelIds.length === 1 ? ' is' : 's are'} not assigned to a telecom room — {takeoff.unassignedAPs} AP{takeoff.unassignedAPs === 1 ? '' : 's'} counted but not switched. Assign them on the Digital Infrastructure tab.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
