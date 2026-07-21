'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderOpen, MapPin, Plus, User, X } from 'lucide-react';
import {
  Card,
  Field,
  TextInput,
  NumberInput,
  Select,
  Segmented,
  Toggle,
} from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';

function Section({ title, children }) {
  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

// Combined name field + saved-projects dropdown: type to name/rename the
// current project, or open the menu to load a saved one. Exported for the
// Property Overview page (components/builder/PropertyOverview.jsx).
export function ProjectNameField({ value, onChange, projects, currentProjectId, onSelectProject, properties = [], onPickProperty = null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // CRM properties of the selected customer, minus ones that already appear
  // as a saved project (the project entry wins — it loads the whole quote).
  const projectNames = new Set(projects.map((p) => (p.project_name || '').trim().toLowerCase()));
  const pickableProperties = onPickProperty
    ? properties.filter((p) => !projectNames.has((p.name || '').trim().toLowerCase()))
    : [];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="flex">
        <TextInput
          value={value}
          onChange={onChange}
          placeholder="e.g. Harborview Hotel"
          className="rounded-r-none"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Open saved projects"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-r-lg border border-l-0 border-slate-200 bg-white px-2 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          <button
            type="button"
            onClick={() => {
              onSelectProject('');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100',
              !currentProjectId ? 'font-medium text-blue-600' : 'text-slate-700'
            )}
          >
            <Plus size={15} /> New Project
          </button>

          {pickableProperties.length > 0 && (
            <>
              <div className="my-1 h-px bg-slate-100" />
              <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Customer Properties
              </p>
              {pickableProperties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPickProperty(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <MapPin size={15} className="shrink-0 text-slate-400" />
                  <span className="truncate">{p.name}</span>
                  {p.address && (
                    <span className="ml-auto shrink-0 max-w-[45%] truncate text-[10px] text-slate-400">{p.address}</span>
                  )}
                </button>
              ))}
            </>
          )}

          {projects.length > 0 ? (
            <>
              <div className="my-1 h-px bg-slate-100" />
              <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Saved Projects
              </p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100',
                    p.id === currentProjectId
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-slate-700'
                  )}
                >
                  <FolderOpen size={15} className="shrink-0 text-slate-400" />
                  <span className="truncate">{p.project_name}</span>
                  {(p.version ?? 1) > 1 && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-400">v{p.version}</span>
                  )}
                  {p.status && p.status !== 'draft' && (
                    <QuoteStatusBadge status={p.status} className="ml-auto shrink-0" />
                  )}
                </button>
              ))}
            </>
          ) : (
            <p className="px-2.5 py-2 text-xs text-slate-400">
              No saved proposals yet — name this one and click Save Proposal.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Customer picker ----
const ACCOUNT_TYPES = [
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'multi_family', label: 'Multi-Family' },
  { value: 'senior_living', label: 'Senior Living' },
  { value: 'education', label: 'Education' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
];

export function CustomerPicker({ accounts = [], crmAccountId, onSelectAccount, onCreateAccount }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('other');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = accounts.find((a) => a.id === crmAccountId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const acct = await onCreateAccount({ name: newName.trim(), type: newType });
      onSelectAccount(acct.id);
      setCreating(false);
      setNewName('');
      setNewType('other');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setCreating(false); }}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm transition-colors hover:border-slate-300"
      >
        <User size={14} className="shrink-0 text-slate-400" />
        <span className={cn('flex-1 truncate text-left', selected ? 'text-slate-900' : 'text-slate-400')}>
          {selected ? selected.name : 'Select or create customer…'}
        </span>
        {selected ? (
          <X
            size={13}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            onClick={(e) => { e.stopPropagation(); onSelectAccount(null); }}
          />
        ) : (
          <ChevronDown size={14} className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          {/* Create new inline */}
          {creating ? (
            <div className="space-y-2 p-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Customer name…"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              >
                {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || busy}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 hover:bg-blue-700"
                >
                  {busy ? 'Saving…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-blue-600 transition-colors hover:bg-blue-50"
              >
                <Plus size={14} /> New customer
              </button>
              {accounts.length > 0 && <div className="my-1 h-px bg-slate-100" />}
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onSelectAccount(a.id); setOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100',
                    a.id === crmAccountId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700'
                  )}
                >
                  <User size={13} className="shrink-0 text-slate-400" />
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{a.type?.replace('_', ' ')}</span>
                </button>
              ))}
              {accounts.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-slate-400">No customers yet — create one above.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The Wi-Fi calculator's design inputs. Property/customer/technology fields
// live on the Property Overview page (components/builder/PropertyOverview.jsx).
export default function InputPanel({ inputs, setInputs, term }) {
  const set = (field, value) => setInputs((prev) => ({ ...prev, [field]: value }));

  // Legacy saved quotes carry 'hallway' / 'inroom' — show them as their
  // modern equivalents (hallway APs were ceiling-mount, in-room were wall).
  // The engine still enforces the Wi-Fi 7 legacy-SKU restriction itself
  // (fix #8) when no tagged wall AP exists, so no UI lockout is needed.
  const deployValue =
    inputs.deploymentType === 'inroom' || inputs.deploymentType === 'wall' ? 'wall' : 'ceiling';

  return (
    <div className="space-y-3">
      <Section title="Network Design">
        <Field label="Wi-Fi Generation">
          <Segmented
            value={inputs.wifiGeneration}
            onChange={(v) => set('wifiGeneration', v)}
            options={[
              { value: 'wifi6', label: 'Wi-Fi 6' },
              { value: 'wifi7', label: 'Wi-Fi 7' },
            ]}
          />
        </Field>
        <Field label="Gateway Model">
          <Select value={inputs.gatewayModel} onChange={(e) => set('gatewayModel', e.target.value)}>
            <option value="NSE3000">NSE3000</option>
            <option value="NSE4000">NSE4000</option>
          </Select>
        </Field>
        <Field label="Deployment Type">
          <Segmented
            value={deployValue}
            onChange={(v) => set('deploymentType', v)}
            options={[
              { value: 'ceiling', label: 'On Ceiling' },
              { value: 'wall', label: 'On Wall' },
            ]}
          />
        </Field>
        <Field label="Quality" sub="Picks equipment tagged Better / Best in the Product Database">
          <Segmented
            value={inputs.wifiQuality ?? 'better'}
            onChange={(v) => set('wifiQuality', v)}
            options={[
              { value: 'better', label: 'Better' },
              { value: 'best', label: 'Best' },
            ]}
          />
        </Field>
        <Field label="License Term" sub="Which linked license ships with tagged equipment">
          <Segmented
            value={Number(inputs.licenseTerm) || 5}
            onChange={(v) => set('licenseTerm', v)}
            options={[
              { value: 1, label: '1 Year' },
              { value: 3, label: '3 Year' },
              { value: 5, label: '5 Year' },
            ]}
          />
        </Field>
        <Field label={term.unitLabel}>
          <NumberInput value={inputs.numberOfRooms} onChange={(v) => set('numberOfRooms', v)} min={0} />
        </Field>
        <Field label={term.apRatioLabel} sub={`1 AP per N ${term.apRatioSub.replace('per ', '')}`}>
          <Select
            value={inputs.apToRoomRatio}
            onChange={(e) => set('apToRoomRatio', Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                1 : {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Number of IDFs">
          <NumberInput value={inputs.numberOfIDFs} onChange={(v) => set('numberOfIDFs', v)} min={1} />
        </Field>
      </Section>

      <Section title="Additional AP Locations">
        <Field label={term.commonAreaLabel}>
          <NumberInput value={inputs.meetingRooms} onChange={(v) => set('meetingRooms', v)} />
        </Field>
        <Field label="Public Area APs">
          <NumberInput value={inputs.publicAreaAPs} onChange={(v) => set('publicAreaAPs', v)} />
        </Field>
        <Field label="Back-of-House APs">
          <NumberInput value={inputs.bohAPs} onChange={(v) => set('bohAPs', v)} />
        </Field>
        <Field label="Outdoor APs">
          <NumberInput value={inputs.outdoorAPs} onChange={(v) => set('outdoorAPs', v)} />
        </Field>
        <Field label={term.wiredLabel}>
          <NumberInput
            value={inputs.guestRoomWiredConnections}
            onChange={(v) => set('guestRoomWiredConnections', v)}
          />
        </Field>
        <Field label={term.businessLabel}>
          <NumberInput
            value={inputs.businessCenterWired}
            onChange={(v) => set('businessCenterWired', v)}
          />
        </Field>
      </Section>

      <Section title="Options">
        <Toggle
          checked={inputs.idfRacksNeeded}
          onChange={(v) => set('idfRacksNeeded', v)}
          label="IDF Racks Needed"
        />
        <Toggle checked={inputs.spareAPs} onChange={(v) => set('spareAPs', v)} label="Include Spare APs (5%)" />
        <Toggle
          checked={inputs.spareSwitches}
          onChange={(v) => set('spareSwitches', v)}
          label="Include Spare Switch"
        />
        <Field label="Aggregate Switch Type">
          <Select value={inputs.aggSwitchType} onChange={(e) => set('aggSwitchType', e.target.value)}>
            <option value="fiber">Fiber (EX3024F)</option>
            <option value="copper">Copper (EX2052P)</option>
          </Select>
        </Field>
        <Toggle
          checked={inputs.cat6Required}
          onChange={(v) => set('cat6Required', v)}
          label="Structured CAT6 Cabling"
        />
        {inputs.cat6Required && (
          <Field label="CAT6 Drops">
            <NumberInput value={inputs.cat6Drops} onChange={(v) => set('cat6Drops', v)} />
          </Field>
        )}
        <Field label="Building-to-Building Connection">
          <Select
            value={inputs.b2bConnectionType}
            onChange={(e) => set('b2bConnectionType', e.target.value)}
          >
            <option value="none">None</option>
            <option value="fiber">Fiber</option>
            <option value="copper">Copper</option>
            <option value="wireless">Wireless</option>
          </Select>
        </Field>
        {inputs.b2bConnectionType !== 'none' && (
          <Field label="B2B Links">
            <NumberInput
              value={inputs.b2bConnectionQty}
              onChange={(v) => set('b2bConnectionQty', v)}
              min={1}
            />
          </Field>
        )}
        <Field
          label="Misc Hardware %"
          sub="0 = fixed $650 line; >0 = percent of hardware subtotal"
        >
          <NumberInput value={inputs.miscHwPercent} onChange={(v) => set('miscHwPercent', v)} />
        </Field>
      </Section>
    </div>
  );
}
