'use client';

import { useState } from 'react';
import { Plus, Trash2, HardDrive, Wifi, Camera, Router, Server, PackageOpen, Loader2, Home, DoorOpen, PlugZap } from 'lucide-react';
import { Card, Button, Field, TextInput, Select } from '@/components/ui/primitives';
import { assetsFromSnapshot } from '@/lib/bomSnapshot';

const ASSET_TYPES = [
  { id: 'access_point',    label: 'Access Point',    icon: Wifi },
  { id: 'camera',          label: 'Camera',          icon: Camera },
  { id: 'switch',          label: 'Switch',          icon: Router },
  { id: 'gateway',         label: 'Gateway',         icon: Router },
  { id: 'nvr',             label: 'NVR',             icon: Server },
  { id: 'smart_device',    label: 'Smart Device',    icon: Home },
  { id: 'door_controller', label: 'Door Controller', icon: DoorOpen },
  { id: 'ev_charger',      label: 'EV Charger',      icon: PlugZap },
  { id: 'other',           label: 'Other',           icon: HardDrive },
];
const TYPE_MAP = Object.fromEntries(ASSET_TYPES.map((t) => [t.id, t]));

function AddAssetForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ name: '', asset_type: 'access_point', serial_number: '', location: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        name: form.name.trim(),
        asset_type: form.asset_type,
        serial_number: form.serial_number.trim() || null,
        location: form.location.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-dashed border-slate-200 p-3 sm:grid-cols-4">
      <Field label="Name" className="sm:col-span-2">
        <TextInput autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Lobby AP" />
      </Field>
      <Field label="Type">
        <Select value={form.asset_type} onChange={(e) => set('asset_type', e.target.value)}>
          {ASSET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </Field>
      <Field label="Serial #">
        <TextInput value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Location" className="sm:col-span-3">
        <TextInput value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Floor 2 hallway" />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Adding…' : 'Add'}</Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function AssetsSection({ assets, onCreate, onDelete, bomSnapshot = null }) {
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Seed the asset list from the accepted proposal's parts list — one row
  // per hardware line (qty noted; serials/locations filled in by techs).
  const generatable = assets.length === 0 ? assetsFromSnapshot(bomSnapshot) : [];
  const generateFromProposal = async () => {
    if (generating || generatable.length === 0) return;
    setGenerating(true);
    try {
      for (const asset of generatable) {
        await onCreate({ ...asset, install_date: new Date().toISOString().slice(0, 10) });
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      {assets.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-12 text-slate-400">
          <HardDrive size={28} className="text-slate-200" />
          <p className="text-sm">No assets tracked for this project yet.</p>
          {generatable.length > 0 && (
            <Button size="sm" variant="outline" className="mt-2" onClick={generateFromProposal} disabled={generating}>
              {generating ? <Loader2 size={13} className="animate-spin" /> : <PackageOpen size={13} />}
              {generating ? 'Generating…' : `Generate ${generatable.length} asset${generatable.length !== 1 ? 's' : ''} from proposal`}
            </Button>
          )}
        </div>
      )}

      {assets.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {assets.map((a) => {
            const type = TYPE_MAP[a.asset_type] ?? TYPE_MAP.other;
            const Icon = type.icon;
            const ticketCount = a.support_tickets?.[0]?.count ?? 0;
            return (
              <div key={a.id} className="group flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{a.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {type.label}{a.serial_number ? ` · ${a.serial_number}` : ''}{a.location ? ` · ${a.location}` : ''}
                  </p>
                </div>
                {ticketCount > 0 && (
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600" title="Support cases linked to this asset">
                    {ticketCount} case{ticketCount !== 1 ? 's' : ''}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {adding ? (
        <AddAssetForm onAdd={onCreate} onClose={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-blue-600"
        >
          <Plus size={12} /> Add asset
        </button>
      )}
    </div>
  );
}
