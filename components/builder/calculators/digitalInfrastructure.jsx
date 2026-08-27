'use client';

import { useState } from 'react';
import { Building2, Plus, Trash2, Upload, MapPin, Sun, Cable, Server } from 'lucide-react';
import { Card, Button } from '@/components/ui/primitives';
import {
  PROPERTY_MODEL_DEFAULTS,
  normalizePropertyModel,
  propertyTotals,
  orderedLevels,
  ensureRoomPerLevel,
  newId,
  shortBuildingName,
  unitClassLabel,
  sortUnitClasses,
} from '@/lib/propertyModel';
import UnitScheduleCard from '@/components/builder/UnitScheduleCard';
import PropertyImportModal from '@/components/builder/PropertyImportModal';
import { cn } from '@/lib/utils';

// Digital Infrastructure calculator — Phase 1 of the complex-project
// Builder: the property model. Buildings → levels → telecom rooms, the
// unit schedule (imported from the architect's unit mix or typed), and the
// named amenity / outdoor / other-drop lists. Nothing is priced here yet:
// Phase 2 reads this model for Wi-Fi AP and switch counts, Phase 3 adds
// rack kits per telecom room, Phase 4 structured cabling. Persists at
// inputs.techCalc.digital_infrastructure (no migration).

const inlineInput =
  'rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-700 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white';

function Section({ title, icon: Icon, children, action }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {Icon && <Icon size={13} className="text-slate-400" />} {title}
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ── Rail: property summary + named lists ───────────────────────────────

function NamedListEditor({ title, icon, items, onChange, qtyLabel, withInclude = false, hint, addLabel }) {
  const update = (id, patch) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id) => onChange(items.filter((i) => i.id !== id));
  const add = () =>
    onChange([...items, { id: newId('loc'), name: '', qty: 1, ...(withInclude ? { included: false } : {}) }]);
  const total = items.reduce((s, i) => s + (withInclude && !i.included ? 0 : i.qty), 0);

  return (
    <Section
      title={title}
      icon={icon}
      action={
        <span className="text-xs tabular-nums text-slate-500">
          {total} {qtyLabel}
        </span>
      }
    >
      {items.length === 0 ? (
        <p className="mb-2 text-[11px] leading-relaxed text-slate-400">{hint}</p>
      ) : (
        <div className="mb-2 space-y-1">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-1.5">
              {withInclude && (
                <input
                  type="checkbox"
                  checked={!!i.included}
                  onChange={(e) => update(i.id, { included: e.target.checked })}
                  title="Include in this proposal"
                  className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                />
              )}
              <input
                className={cn(inlineInput, 'min-w-0 flex-1', withInclude && !i.included && 'text-slate-400 line-through')}
                value={i.name}
                placeholder="Name"
                onChange={(e) => update(i.id, { name: e.target.value })}
              />
              <input
                type="number"
                min="0"
                className={cn(inlineInput, 'w-14 text-right tabular-nums')}
                value={i.qty}
                onChange={(e) => update(i.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
              />
              <button type="button" onClick={() => remove(i.id)} title="Remove" className="rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus size={12} /> {addLabel}
      </Button>
    </Section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function InputPanel({ value, onChange }) {
  const model = normalizePropertyModel(value);
  const totals = propertyTotals(model);
  const mdf = model.rooms.find((r) => r.isMdf);
  const classes = sortUnitClasses(Object.keys(totals.byClass));

  return (
    <div className="space-y-3">
      <Section title="Property" icon={Building2}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <Stat label="Units" value={totals.units} />
          <Stat label="Beds" value={totals.beds} />
          <Stat label="Buildings" value={totals.buildings} sub={`${totals.levels} level${totals.levels === 1 ? '' : 's'}`} />
          <Stat label="Telecom rooms" value={totals.rooms} sub={mdf ? `MDF: ${mdf.name}` : totals.rooms ? 'No MDF designated' : undefined} />
        </div>
        {classes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {classes.map((cls) => (
              <span key={cls} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                {unitClassLabel(cls)} <b className="tabular-nums">{totals.byClass[cls]}</b>
              </span>
            ))}
          </div>
        )}
      </Section>

      <NamedListEditor
        title="Amenity AP locations"
        icon={MapPin}
        items={model.amenityLocations}
        onChange={(items) => onChange({ amenityLocations: items })}
        qtyLabel="APs"
        addLabel="Location"
        hint="Lounge, fitness, leasing, mail room… one row per space; the counts become the amenity APs and common-area drops."
      />
      <NamedListEditor
        title="Outdoor AP locations"
        icon={Sun}
        items={model.outdoorLocations}
        onChange={(items) => onChange({ outdoorLocations: items })}
        qtyLabel="APs"
        addLabel="Location"
        hint="Pool, courtyards, pet spa, EV area… one row per spot with how many APs it needs."
      />
      <NamedListEditor
        title="Other network drops"
        icon={Cable}
        items={model.otherDrops}
        onChange={(items) => onChange({ otherDrops: items })}
        qtyLabel="drops"
        withInclude
        addLabel="Drop"
        hint="Elevators, fire alarm, printers, access control, phones… tick the ones this proposal includes; the rest are listed as exclusions."
      />

      <Section title="Notes & exclusions">
        <textarea
          value={model.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Assumptions and exclusions for the scope of work, e.g. no parking-garage APs."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </Section>
    </div>
  );
}

// ── Surface: layout editor + unit schedule ─────────────────────────────

function PropertyLayoutCard({ model, totals, onChange, onImport }) {
  const levels = orderedLevels(model);
  const roomById = Object.fromEntries(model.rooms.map((r) => [r.id, r]));
  const unassigned = model.levels.filter((l) => !l.roomId).length;

  const setBuildings = (buildings) => onChange({ buildings });
  const addBuilding = () => {
    const building = { id: newId('bldg'), name: `Building ${model.buildings.length + 1}` };
    const level = { id: newId('lvl'), buildingId: building.id, name: 'Level 1', roomId: null };
    const next = ensureRoomPerLevel({ ...model, buildings: [...model.buildings, building], levels: [...model.levels, level] });
    onChange({ buildings: next.buildings, levels: next.levels, rooms: next.rooms });
  };
  const renameBuilding = (id, name) => setBuildings(model.buildings.map((b) => (b.id === id ? { ...b, name } : b)));
  const removeBuilding = (id) => {
    const gone = new Set(model.levels.filter((l) => l.buildingId === id).map((l) => l.id));
    onChange({
      buildings: model.buildings.filter((b) => b.id !== id),
      levels: model.levels.filter((l) => l.buildingId !== id),
      unitTypes: model.unitTypes.map((u) => ({ ...u, counts: Object.fromEntries(Object.entries(u.counts).filter(([lid]) => !gone.has(lid))) })),
    });
  };

  const addLevel = (buildingId) => {
    const count = model.levels.filter((l) => l.buildingId === buildingId).length;
    const level = { id: newId('lvl'), buildingId, name: `Level ${count + 1}`, roomId: null };
    const next = ensureRoomPerLevel({ ...model, levels: [...model.levels, level] });
    onChange({ levels: next.levels, rooms: next.rooms });
  };
  const updateLevel = (id, patch) => onChange({ levels: model.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLevel = (id) =>
    onChange({
      levels: model.levels.filter((l) => l.id !== id),
      unitTypes: model.unitTypes.map((u) => {
        const counts = { ...u.counts };
        delete counts[id];
        return { ...u, counts };
      }),
    });

  const addRoom = () =>
    onChange({ rooms: [...model.rooms, { id: newId('room'), name: `IDF ${model.rooms.length + 1}`, isMdf: model.rooms.length === 0 }] });
  const renameRoom = (id, name) => onChange({ rooms: model.rooms.map((r) => (r.id === id ? { ...r, name } : r)) });
  const setMdf = (id) => onChange({ rooms: model.rooms.map((r) => ({ ...r, isMdf: r.id === id })) });
  const removeRoom = (id) =>
    onChange({
      rooms: model.rooms.filter((r) => r.id !== id),
      levels: model.levels.map((l) => (l.roomId === id ? { ...l, roomId: null } : l)),
    });
  const roomPerLevel = () => {
    const next = ensureRoomPerLevel(model);
    onChange({ rooms: next.rooms, levels: next.levels });
  };

  if (model.buildings.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Building2 size={28} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Start with the property</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          Import the architect&apos;s unit mix — buildings, levels, and telecom rooms come from its column headers — or lay the property out by hand.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={onImport}>
            <Upload size={14} /> Import unit schedule
          </Button>
          <Button variant="outline" onClick={addBuilding}>
            <Plus size={14} /> Add building
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Building2 size={14} className="text-slate-400" /> Buildings, Levels &amp; Telecom Rooms
          <span className="text-xs font-normal text-slate-400">
            {totals.buildings} building{totals.buildings === 1 ? '' : 's'} · {totals.levels} level{totals.levels === 1 ? '' : 's'} · {totals.rooms} room{totals.rooms === 1 ? '' : 's'}
          </span>
        </h3>
        <div className="flex gap-2">
          {unassigned > 0 && (
            <Button variant="outline" size="sm" onClick={roomPerLevel} title="Give every unassigned level its own telecom room">
              <Server size={13} /> Room per level
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={addBuilding}>
            <Plus size={13} /> Building
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {model.buildings.map((b) => {
            const bLevels = levels.filter((l) => l.buildingId === b.id);
            return (
              <div key={b.id} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                  <input className={cn(inlineInput, 'w-48 font-semibold')} value={b.name} onChange={(e) => renameBuilding(b.id, e.target.value)} />
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums text-slate-500">{totals.byBuilding[b.id]?.units ?? 0} units</span>
                    <button type="button" onClick={() => removeBuilding(b.id)} title="Remove building" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-1 font-medium">Level</th>
                      <th className="px-3 py-1 font-medium">Telecom room</th>
                      <th className="px-3 py-1 text-right font-medium">Units</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bLevels.map((l) => (
                      <tr key={l.id} className="border-t border-slate-50">
                        <td className="px-3 py-1">
                          <input className={cn(inlineInput, 'w-32')} value={l.name} onChange={(e) => updateLevel(l.id, { name: e.target.value })} />
                        </td>
                        <td className="px-3 py-1">
                          <select className={cn(inlineInput, 'w-40', !l.roomId && 'text-amber-600')} value={l.roomId ?? ''} onChange={(e) => updateLevel(l.id, { roomId: e.target.value || null })}>
                            <option value="">— unassigned —</option>
                            {model.rooms.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}{r.isMdf ? ' (MDF)' : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums text-slate-600">{totals.byLevel[l.id]?.units ?? 0}</td>
                        <td className="px-1 py-1 text-right">
                          <button type="button" onClick={() => removeLevel(l.id)} title="Remove level" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-slate-100 px-3 py-1.5">
                  <button type="button" onClick={() => addLevel(b.id)} className="text-xs font-medium text-blue-600 hover:underline">
                    + Add level
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Server size={12} className="text-slate-400" /> Telecom rooms
            </span>
            <button type="button" onClick={addRoom} className="text-xs font-medium text-blue-600 hover:underline">+ Room</button>
          </div>
          {model.rooms.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-400">No rooms yet — &ldquo;Room per level&rdquo; creates one IDF per level; then mark the MDF.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {model.rooms.map((r) => {
                const served = totals.byRoom[r.id];
                return (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                    <input
                      type="radio"
                      name="property-mdf"
                      checked={r.isMdf}
                      onChange={() => setMdf(r.id)}
                      title="Main distribution frame"
                      className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <input className={cn(inlineInput, 'w-full', r.isMdf && 'font-semibold')} value={r.name} onChange={(e) => renameRoom(r.id, e.target.value)} />
                      <p className="px-1 text-[10px] text-slate-400">
                        {r.isMdf ? 'MDF · ' : ''}
                        {served?.levelIds.length ?? 0} level{served?.levelIds.length === 1 ? '' : 's'} · {served?.units ?? 0} units
                      </p>
                    </div>
                    <button type="button" onClick={() => removeRoom(r.id)} title="Remove room" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            The radio marks the MDF. Assign several levels to one room when a closet serves more than one floor.
          </p>
        </div>
      </div>
    </Card>
  );
}

function Surface({ value, onChange }) {
  const model = normalizePropertyModel(value);
  const totals = propertyTotals(model);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PropertyLayoutCard model={model} totals={totals} onChange={onChange} onImport={() => setImportOpen(true)} />
      <UnitScheduleCard model={model} totals={totals} onChange={onChange} onImport={() => setImportOpen(true)} />
      <PropertyImportModal
        open={importOpen}
        hasExisting={model.unitTypes.length > 0 || model.levels.length > 0}
        onClose={() => setImportOpen(false)}
        onApply={(imported) => {
          onChange(imported);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

export const digitalInfrastructureCalculator = {
  techId: 'digital_infrastructure',
  defaults: PROPERTY_MODEL_DEFAULTS,
  InputPanel,
  Surface,
};
