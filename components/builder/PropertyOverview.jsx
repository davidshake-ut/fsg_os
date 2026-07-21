'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, FileDown, FileText, Link2, Pencil, Plus, Sheet, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import { Card, Button, Field, TextInput, NumberInput, Segmented, Toggle } from '@/components/ui/primitives';
import { CustomerPicker, ProjectNameField } from '@/components/InputPanel';
import CostSummary from '@/components/CostSummary';
import LaborTable from '@/components/LaborTable';
import { BUILTIN_TECHNOLOGIES, companyTechnologies } from '@/lib/technologies';
import { cn } from '@/lib/utils';

// The Builder's front page: who and where the system is for, which
// technologies it includes, and the whole-proposal summary + actions.
// Tech pages hold the design detail; this page is the cockpit.

function PanelCard({ title, children, action = null }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function CustomTechRow({ tech, enabled, onToggle, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tech.label);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== tech.label) onRename(tech.id, v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="h-8 flex-1 rounded-lg border border-blue-400 px-2 text-sm outline-none ring-2 ring-blue-400/20" />
        <button type="button" onClick={commit} aria-label="Save name" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-1">
      <div className="flex-1">
        <Toggle checked={enabled} onChange={(v) => onToggle(tech.id, v)} label={tech.label} />
      </div>
      <button type="button" onClick={() => { setDraft(tech.label); setEditing(true); }} title="Rename technology"
        className="rounded p-1 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600">
        <Pencil size={12} />
      </button>
      <button type="button" onClick={() => onRemove(tech.id)} title="Remove technology"
        className="rounded p-1 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export default function PropertyOverview({
  inputs,
  setInputs,
  company = null,
  isAdmin = false,
  // customer + project identity
  crmAccounts = [],
  crmAccountId = null,
  onSelectAccount = () => {},
  onCreateAccount = async () => {},
  properties = [],
  projects = [],
  currentProjectId = null,
  onSelectProject = () => {},
  // technologies
  enabledTechs = {},
  onToggleTech = () => {},
  onAddCustomTech = async () => {},
  onRenameCustomTech = async () => {},
  onRemoveCustomTech = async () => {},
  // summary + labor
  sections = [],
  scope = '',
  canViewMargin = false,
  laborRoles = [],
  setLaborRoles = () => {},
  estimatedHours = {},
  // actions
  onCreateProposal = () => {},
  onExportCSV = () => {},
  onExportPDF = () => {},
  busy = false,
}) {
  const set = (field, value) => setInputs((prev) => ({ ...prev, [field]: value }));
  const [addingTech, setAddingTech] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [laborOpen, setLaborOpen] = useState(false);

  const techs = companyTechnologies(company);
  const builtinIds = new Set(BUILTIN_TECHNOLOGIES.map((t) => t.id));

  // Property auto-link preview: the Project/Property Name IS the property.
  const trimmedName = (inputs.propertyName || '').trim();
  const matchedProperty = crmAccountId && trimmedName
    ? properties.find((p) => p.name?.trim().toLowerCase() === trimmedName.toLowerCase())
    : null;

  // Auto-fill the address from CRM data once customer + property line up.
  // Fires only while the field is blank (a hand-typed address is never
  // clobbered — the "Use address on file" link below covers corrections).
  // An effect because the match can materialize asynchronously: picking a
  // customer refetches that account's properties after the fact.
  const matchedAddress = matchedProperty?.address?.trim() || '';
  const addressBlank = !(inputs.propertyAddress || '').trim();
  useEffect(() => {
    if (matchedAddress && addressBlank) {
      setInputs((prev) => ({ ...prev, propertyAddress: matchedAddress }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedAddress, addressBlank]);

  const submitNewTech = async () => {
    const v = newTechName.trim();
    if (!v) return;
    await onAddCustomTech(v);
    setNewTechName('');
    setAddingTech(false);
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[380px_1fr]">
      {/* ── Left: identity + technologies + actions ── */}
      <div className="min-w-0 space-y-4">
        <PanelCard title="Property Overview">
          <Field label="Customer">
            <CustomerPicker
              accounts={crmAccounts}
              crmAccountId={crmAccountId}
              onSelectAccount={onSelectAccount}
              onCreateAccount={onCreateAccount}
            />
          </Field>
          <Field label="Project / Property Name">
            <ProjectNameField
              value={inputs.propertyName}
              onChange={(e) => set('propertyName', e.target.value)}
              projects={
                // With a customer selected the dropdown shows only THEIR
                // saved projects; with none it shows everything as before.
                crmAccountId
                  ? projects.filter((p) => (p.crm_account_id ?? p.crmAccountId ?? null) === crmAccountId)
                  : projects
              }
              currentProjectId={currentProjectId}
              onSelectProject={onSelectProject}
              properties={crmAccountId ? properties : []}
              onPickProperty={(p) =>
                // Explicit property pick: name it AND take its address on file.
                setInputs((prev) => ({
                  ...prev,
                  propertyName: p.name,
                  ...(p.address?.trim() ? { propertyAddress: p.address.trim() } : {}),
                }))
              }
            />
            {trimmedName && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                <Link2 size={11} className="shrink-0" />
                {!crmAccountId
                  ? 'Pick a customer to link this to a property.'
                  : matchedProperty
                    ? <>Linked to existing property: <span className="font-medium text-slate-500">{matchedProperty.name}</span></>
                    : 'A new property will be created for this customer on save.'}
              </p>
            )}
          </Field>
          <Field label="Property Address">
            <TextInput
              value={inputs.propertyAddress}
              onChange={(e) => set('propertyAddress', e.target.value)}
              placeholder="123 Main St, City, ST"
            />
            {matchedAddress && !addressBlank && inputs.propertyAddress.trim() !== matchedAddress && (
              <button
                type="button"
                onClick={() => set('propertyAddress', matchedAddress)}
                className="mt-1 text-left text-[11px] text-blue-600 hover:underline"
              >
                Use address on file: {matchedAddress}
              </button>
            )}
          </Field>
          <Field label="Property Type">
            <Segmented
              value={inputs.propertyType}
              onChange={(v) => set('propertyType', v)}
              options={[
                { value: 'hospitality', label: 'Hospitality' },
                { value: 'senior_living', label: 'Senior Living' },
                { value: 'multifamily', label: 'Multi-Family' },
              ]}
            />
          </Field>
        </PanelCard>

        <PanelCard
          title="Technologies"
          action={isAdmin && !addingTech && (
            <button type="button" onClick={() => setAddingTech(true)}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              <Plus size={12} /> Add technology
            </button>
          )}
        >
          {techs.map((t) => (
            builtinIds.has(t.id) ? (
              <Toggle
                key={t.id}
                checked={enabledTechs[t.id] === true}
                onChange={(v) => onToggleTech(t.id, v)}
                label={t.label}
              />
            ) : (
              <CustomTechRow
                key={t.id}
                tech={t}
                enabled={enabledTechs[t.id] === true}
                onToggle={onToggleTech}
                onRename={onRenameCustomTech}
                onRemove={onRemoveCustomTech}
              />
            )
          ))}
          {addingTech && (
            <div className="flex items-center gap-1 pt-1">
              <input autoFocus value={newTechName} onChange={(e) => setNewTechName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNewTech(); if (e.key === 'Escape') setAddingTech(false); }}
                placeholder="Technology name…"
                className="h-8 flex-1 rounded-lg border border-blue-400 px-2 text-sm outline-none ring-2 ring-blue-400/20" />
              <button type="button" onClick={submitNewTech} aria-label="Add" className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>
              <button type="button" onClick={() => setAddingTech(false)} aria-label="Cancel" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3">
            <Toggle
              checked={inputs.includeShipping !== false}
              onChange={(v) => set('includeShipping', v)}
              label="Estimate Shipping"
            />
            {inputs.includeShipping !== false && (
              <div className="mt-2">
                <Field label="Shipping (% of hardware)">
                  <NumberInput
                    value={inputs.shippingPercent ?? 7}
                    onChange={(v) => set('shippingPercent', v)}
                  />
                </Field>
              </div>
            )}
          </div>
        </PanelCard>

        <Card className="space-y-2 p-4">
          <Button className="w-full" onClick={onCreateProposal} disabled={busy}
            title="Save this version, generate the customer PDF (proposal + scope of work), and file it on the Proposals tab">
            <Sparkles size={14} /> {busy ? 'Working…' : 'Create Proposal'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onExportCSV}><Sheet size={14} /> CSV</Button>
            <Button variant="outline" onClick={onExportPDF}><FileDown size={14} /> PDF</Button>
          </div>
        </Card>
      </div>

      {/* ── Right: the whole-proposal summary + project-wide labor ── */}
      <div className="min-w-0 space-y-4">
        <CostSummary sections={sections} scope={scope} canViewMargin={canViewMargin} />

        <Card className="overflow-hidden">
          <button type="button" onClick={() => setLaborOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Wrench size={14} className="text-slate-400" /> Professional Labor
              <span className="text-xs font-normal text-slate-400">— project-wide rate card</span>
            </span>
            <ChevronDown size={15} className={cn('text-slate-400 transition-transform', laborOpen && 'rotate-180')} />
          </button>
          {laborOpen && (
            <div className="border-t border-slate-100 p-4">
              <LaborTable
                roles={laborRoles}
                setRoles={setLaborRoles}
                estimatedHours={estimatedHours}
                showMargin={canViewMargin}
                canViewMargin={canViewMargin}
              />
            </div>
          )}
        </Card>

        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <FileText size={12} className="shrink-0" />
          Design each system on its technology tab above — this page always shows the rolled-up result.
        </p>
      </div>
    </div>
  );
}
