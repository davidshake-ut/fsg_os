'use client';

import { useState } from 'react';
import { Factory, Plus, Pencil, Trash2, Check, X, Cpu } from 'lucide-react';
import { Card, Button, TextInput, Select, Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

// Per-technology vendor manager, mounted on the tech page's sub-overview.
// Two zones in one card:
//   - the company registry (admin-only edits): add / rename / remove the
//     vendors this technology can be quoted with; registry entry 0 hosts
//     the legacy design calculator on Managed Wi-Fi / Video Surveillance.
//   - this quote's selection (any writer): which vendors are enabled here
//     and which one is the primary (Option A — the quoted total).
//
// Suggested first vendors match the base catalog's manufacturer strings so
// existing products light up without retagging.
const SUGGESTED_FIRST = {
  managed_wifi: 'Cambium Networks',
  video_surveillance: 'Uniview',
};

function VendorRow({ vendor, isAdmin, isEngineHost, onRename, onRemove, children }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vendor.name);

  const commit = () => {
    const next = name.trim();
    if (next && next !== vendor.name) onRename(next);
    setEditing(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3 py-2">
      {children}
      {editing ? (
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <TextInput
            className="h-7 flex-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setName(vendor.name); setEditing(false); }
            }}
            autoFocus
          />
          <button type="button" onClick={commit} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" title="Save name">
            <Check size={14} />
          </button>
          <button type="button" onClick={() => { setName(vendor.name); setEditing(false); }} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Cancel">
            <X size={14} />
          </button>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-700">{vendor.name}</span>
          {isEngineHost && (
            <Badge className="border-blue-200 bg-blue-50 text-blue-600">
              <Cpu size={10} className="mr-0.5 inline" /> design calculator
            </Badge>
          )}
          {vendor.orphaned && (
            <Badge className="border-amber-200 bg-amber-50 text-amber-700">removed from registry</Badge>
          )}
        </span>
      )}
      {isAdmin && !vendor.orphaned && !editing && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setEditing(true)} title="Rename vendor (also retags its catalog products)"
            className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
            <Pencil size={13} />
          </button>
          <button type="button" onClick={onRemove} title="Remove vendor from this technology"
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        </span>
      )}
    </div>
  );
}

export default function TechVendorsCard({
  tech,                 // { id, label }
  registry = [],        // companyTechVendors(company, tech.id)
  quoteVendors = [],    // resolveQuoteVendors(...) — enabled on this quote
  catalogVendors = [],  // distinct Vendor values present in the Product Database
  hasEngine = false,    // tech has the legacy wifi/camera calculator
  isAdmin = false,
  canWrite = true,
  onAddVendor,          // (name) => void
  onRenameVendor,       // (id, name) => void
  onRemoveVendor,       // (id) => void
  onToggleVendor,       // (vendorEntry, enabled) => void
  onSetPrimary,         // (vendorId) => void
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVendorMode, setNewVendorMode] = useState(false); // free-text escape hatch

  const enabledIds = new Set(quoteVendors.map((v) => v.id));
  const primaryId = quoteVendors.find((v) => v.isPrimary)?.id ?? null;
  const orphaned = quoteVendors.filter((v) => !registry.some((r) => r.id === v.id));
  const multi = quoteVendors.length > 1;

  // Pick from vendors already tagged on products (minus ones registered
  // here) — typing risks a name that doesn't match the catalog. "New
  // vendor…" covers brands with no tagged products yet.
  const registered = new Set(registry.map((r) => r.name));
  const pickable = catalogVendors.filter((v) => !registered.has(v));
  const useDropdown = pickable.length > 0 && !newVendorMode;

  const closeAdd = () => {
    setAdding(false);
    setNewName('');
    setNewVendorMode(false);
  };

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddVendor(name);
    closeAdd();
  };

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Factory size={14} className="text-slate-400" /> Vendors
        </h3>
        {isAdmin && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add vendor
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-400">
        {registry.length === 0
          ? `Quote ${tech.label} against specific manufacturers — each vendor gets its own build tab, and enabling two lets you present an A/B comparison.`
          : multi
            ? 'The primary vendor (Option A) is the quoted total; other enabled vendors render as clearly-marked alternates.'
            : 'Enable a second vendor on this quote to build an A/B comparison.'}
      </p>

      {adding && (
        <div className="mb-3 flex items-center gap-2">
          {useDropdown ? (
            <Select
              className="h-8 flex-1 text-sm"
              value={newName}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setNewVendorMode(true);
                  setNewName('');
                } else {
                  setNewName(e.target.value);
                }
              }}
              autoFocus
            >
              <option value="">— choose a vendor from the Product Database —</option>
              {pickable.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value="__new__">New vendor…</option>
            </Select>
          ) : (
            <TextInput
              className="h-8 flex-1 text-sm"
              placeholder={SUGGESTED_FIRST[tech.id] && registry.length === 0
                ? `e.g. ${SUGGESTED_FIRST[tech.id]} (matches the built-in catalog)`
                : 'Vendor name — matches the Vendor field on products'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitAdd(); }
                if (e.key === 'Escape') closeAdd();
              }}
              autoFocus
            />
          )}
          <Button size="sm" onClick={submitAdd} disabled={!newName.trim()}>Add</Button>
          <Button variant="outline" size="sm" onClick={closeAdd}>Cancel</Button>
        </div>
      )}

      {(registry.length > 0 || orphaned.length > 0) && (
        <div className="space-y-1.5">
          {registry.map((v, i) => {
            const enabled = enabledIds.has(v.id);
            return (
              <VendorRow
                key={v.id}
                vendor={v}
                isAdmin={isAdmin}
                isEngineHost={hasEngine && i === 0}
                onRename={(name) => onRenameVendor(v.id, name)}
                onRemove={() => onRemoveVendor(v.id)}
              >
                <label className={cn('flex shrink-0 items-center gap-1.5 text-xs', canWrite ? 'cursor-pointer text-slate-500' : 'text-slate-300')}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!canWrite}
                    onChange={(e) => onToggleVendor(v, e.target.checked)}
                  />
                  on this quote
                </label>
                <label
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    enabled && v.id === primaryId
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-400',
                    enabled && canWrite ? 'cursor-pointer' : 'opacity-50'
                  )}
                  title="Primary = Option A, the quoted total"
                >
                  <input
                    type="radio"
                    name={`primary-${tech.id}`}
                    className="hidden"
                    checked={enabled && v.id === primaryId}
                    disabled={!enabled || !canWrite}
                    onChange={() => onSetPrimary(v.id)}
                  />
                  {enabled && v.id === primaryId ? 'Primary · Option A' : 'Set primary'}
                </label>
              </VendorRow>
            );
          })}
          {orphaned.map((v) => (
            <VendorRow key={v.id} vendor={{ ...v, orphaned: true }} isAdmin={false}>
              <label className={cn('flex shrink-0 items-center gap-1.5 text-xs', canWrite ? 'cursor-pointer text-slate-500' : 'text-slate-300')}>
                <input
                  type="checkbox"
                  checked
                  disabled={!canWrite}
                  onChange={() => onToggleVendor(v, false)}
                />
                on this quote
              </label>
            </VendorRow>
          ))}
        </div>
      )}
    </Card>
  );
}
