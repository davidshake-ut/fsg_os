'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { FileDown, FileText, Sheet, Save, FolderKanban, CheckCircle2, X, Loader2, Send, Ban, Undo2, GitBranch, ChevronDown } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import InputPanel from '@/components/InputPanel';
import CameraInputPanel from '@/components/CameraInputPanel';
import { useBranding } from '@/hooks/useBranding';
import SummaryCards from '@/components/SummaryCards';
import BOMTable from '@/components/BOMTable';
import LaborTable from '@/components/LaborTable';
import CostSummary from '@/components/CostSummary';
import CameraSystems from '@/components/CameraSystems';
import ProductDatabase from '@/components/ProductDatabase';
import ProductModal from '@/components/ProductModal';
import { Button } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import QuoteStatusBadge from '@/components/QuoteStatusBadge';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { calculateBOM } from '@/lib/calculateBOM';
import { calculateCameraBOM } from '@/lib/calculateCameraBOM';
import { calculateLabor } from '@/lib/calculateLabor';
import { estimateLaborHours } from '@/lib/estimateLaborHours';
import { useProducts } from '@/hooks/useProducts';
import { useProjects } from '@/hooks/useProjects';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { useTemplates } from '@/hooks/useTemplates';
import { systemTemplatesForTech } from '@/lib/templates/index';
import { DEFAULT_INPUTS, DEFAULT_CAMERA_INPUTS, DEFAULT_LABOR_ROLES } from '@/lib/defaults';
import { resolveBuilderDefaults } from '@/lib/builderDefaults';
import { getTerminology } from '@/lib/terminology';
import { exportPDF, wifiKpis, cameraKpis } from '@/lib/exportPDF';
import { exportProposalPDF } from '@/lib/exportProposal';
import { exportCSV } from '@/lib/exportCSV';
import { buildScopeOfWork } from '@/lib/scopeOfWork';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'hardware', label: 'Managed Wi-Fi' },
  { id: 'cameras', label: 'Camera Systems' },
  { id: 'services', label: 'Services' },
  { id: 'summary', label: 'Summary' },
  { id: 'products', label: 'Product Database' },
];

// Status badge + dropdown of the transitions valid from the current status.
function QuoteLifecycleMenu({ quote, onTransition, onRevision }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const status = quote.status ?? 'draft';
  const nextVersion = (quote.version ?? 1) + 1;
  const items = [];
  if (status === 'draft') {
    items.push({ label: 'Mark as Sent', Icon: Send, run: () => onTransition('sent') });
  }
  if (status === 'sent') {
    items.push({ label: 'Mark Accepted', Icon: CheckCircle2, run: () => onTransition('accepted') });
    items.push({ label: 'Mark Declined', Icon: Ban, run: () => onTransition('declined') });
    items.push({ label: 'Reopen as Draft', Icon: Undo2, run: () => onTransition('draft') });
  }
  if (status === 'declined' || status === 'expired') {
    items.push({ label: 'Reopen as Draft', Icon: Undo2, run: () => onTransition('draft') });
  }
  if (status !== 'draft') {
    items.push({ label: `New Revision (v${nextVersion})`, Icon: GitBranch, run: onRevision });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quote status actions"
        className="flex items-center gap-0.5 rounded-full hover:opacity-80"
      >
        <QuoteStatusBadge status={status} version={quote.version} />
        <ChevronDown size={12} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
          {items.map(({ label, Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setOpen(false); run(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Icon size={14} className="shrink-0 text-slate-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Prefer a company-owned template over the built-in system one for a given
// technology, so a team's customized version wins once they've made one.
function pickTemplateForTech(allTemplates, technology) {
  const matches = allTemplates.filter((t) => t.technology === technology);
  return matches.find((t) => !t.isSystem) ?? matches.find((t) => t.isSystem) ?? null;
}

function Calculator() {
  const { configured, session, company, user, isSuperAdmin, isAdmin, role, refresh } =
    useSession();

  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [cameraInputs, setCameraInputs] = useState(DEFAULT_CAMERA_INPUTS);
  const [priceOverrides, setPriceOverrides] = useState({});
  const [serviceOverrides, setServiceOverrides] = useState({});
  const [customLineItems, setCustomLineItems] = useState([]);
  const [laborRoles, setLaborRoles] = useState(DEFAULT_LABOR_ROLES);
  const [activeTab, setActiveTab] = useState('hardware');
  const [showMargin, setShowMargin] = useState(false);
  const [editPrices, setEditPrices] = useState(false);
  // Cost/margin/profit are internal figures — a plain 'user' role never sees
  // them (local mode has no roles, so it's always the single operator).
  const canViewMargin = configured ? isAdmin : true;
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [modal, setModal] = useState({ open: false, product: null });
  const [busy, setBusy] = useState(false);
  const [currentCrmAccountId, setCurrentCrmAccountId] = useState(null);

  const [catalogTeamId, setCatalogTeamId] = useState('all');
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!(isSuperAdmin && session && supabase)) return;
    void (async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      setTeams(data || []);
    })();
  }, [isSuperAdmin, session]);

  // Apply team/user builder defaults once, when the session resolves (or
  // immediately in local mode). Never re-applies over a loaded project.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current) return;
    if (configured && !user && !company) return; // session still resolving
    defaultsApplied.current = true;
    if (currentProjectId) return;
    const d = resolveBuilderDefaults({ user, company, configured });
    setInputs((prev) => ({
      ...prev,
      includeWifi:     d.includeWifi,
      includeCameras:  d.includeCameras,
      includeShipping: d.includeShipping,
      shippingPercent: d.shippingPercent,
    }));
  }, [configured, user, company, currentProjectId]);

  const { branding, setBranding } = useBranding({ configured, company, onSaved: refresh });
  const { accounts: crmAccounts, createAccount: createCrmAccount } = useCRMAccounts(session, company, user);
  const { allProducts, addProduct, editProduct, deleteProduct, importProducts, bulkUpdateProducts } = useProducts(
    session,
    { teamFilter: catalogTeamId }
  );
  const { projects, loadError: projectsLoadError, refresh: refreshProjects, loadProject, saveProject, setQuoteStatus, deleteProject } = useProjects(session, company, user);
  const { projects: psaProjects, createProject: createPSAProject } = usePSAProjects(session, company, user);
  const { allTemplates } = useTemplates(session, company, user);

  // A locked quote (sent/accepted/declined) freezes its own catalog snapshot
  // (see setQuoteStatus) so later catalog/discount changes never reprice it —
  // computed early since bom/cameraBom below need it.
  const currentQuote = projects.find((p) => p.id === currentProjectId) ?? null;
  const quoteStatus = currentQuote?.status ?? 'draft';
  const quoteLocked = !!currentQuote && quoteStatus !== 'draft';
  const catalogSnapshot = quoteLocked ? (currentQuote.catalog_snapshot ?? null) : null;

  const [toProjectOpen,  setToProjectOpen]  = useState(false);
  const [newPsaProjectId, setNewPsaProjectId] = useState(null);
  const [toProjectBusy,  setToProjectBusy]  = useState(false);
  const [toProjectForm,  setToProjectForm]  = useState({ name: '', customer_name: '', start_date: '', budget: '', useTemplate: true });
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const canManageCatalog = configured
    ? (role === 'company_admin' || isSuperAdmin) &&
      !!company &&
      (!isSuperAdmin || catalogTeamId === 'all' || catalogTeamId === company.id)
    : true;

  const bom = useMemo(
    () =>
      calculateBOM(
        inputs,
        priceOverrides,
        serviceOverrides,
        allProducts,
        customLineItems.filter((c) => c.system === 'wifi'),
        catalogSnapshot
      ),
    [inputs, priceOverrides, serviceOverrides, allProducts, customLineItems, catalogSnapshot]
  );

  const wifiEnabled = inputs.includeWifi !== false;
  const camerasEnabled = inputs.includeCameras !== false;
  const includeShipping = inputs.includeShipping !== false;
  const shippingPercent = inputs.shippingPercent ?? 7;

  const cameraBom = useMemo(
    () =>
      calculateCameraBOM(
        camerasEnabled ? cameraInputs : {},
        priceOverrides,
        serviceOverrides,
        allProducts,
        camerasEnabled ? customLineItems.filter((c) => c.system === 'camera') : [],
        { includeShipping, shippingPercent, catalogSnapshot }
      ),
    [
      camerasEnabled,
      cameraInputs,
      priceOverrides,
      serviceOverrides,
      allProducts,
      customLineItems,
      includeShipping,
      shippingPercent,
      catalogSnapshot,
    ]
  );

  const estimatedHours = useMemo(
    () => estimateLaborHours({ wifiBom: bom, cameraBom, inputs, cameraInputs }),
    [bom, cameraBom, inputs, cameraInputs]
  );
  const labor = useMemo(
    () => calculateLabor(laborRoles, estimatedHours),
    [laborRoles, estimatedHours]
  );

  const newCustomId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const addCustomLine = (system, segment) =>
    setCustomLineItems((prev) => [
      ...prev,
      { id: newCustomId(), system, segment, sku: '', description: '', qty: 1, cost: 0, price: 0 },
    ]);
  const updateCustomLine = (id, field, value) =>
    setCustomLineItems((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  const removeCustomLine = (id) =>
    setCustomLineItems((prev) => prev.filter((c) => c.id !== id));
  const term = getTerminology(inputs.propertyType);

  const visibleTabs = TABS.filter((t) => {
    if (t.id === 'hardware') return wifiEnabled;
    if (t.id === 'cameras') return camerasEnabled;
    return true;
  });
  const tab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id || 'summary';

  const onCameras = tab === 'cameras';
  const dashView = tab === 'hardware' ? 'wifi' : onCameras ? 'cameras' : 'both';

  const hasChanges = useMemo(() => {
    if (!savedSnapshot) {
      return (
        Object.keys(priceOverrides).length > 0 ||
        Object.keys(serviceOverrides).length > 0 ||
        customLineItems.length > 0 ||
        JSON.stringify(inputs) !== JSON.stringify(DEFAULT_INPUTS) ||
        JSON.stringify(cameraInputs) !== JSON.stringify(DEFAULT_CAMERA_INPUTS) ||
        JSON.stringify(laborRoles) !== JSON.stringify(DEFAULT_LABOR_ROLES)
      );
    }
    return (
      JSON.stringify(inputs) !== JSON.stringify(savedSnapshot.inputs) ||
      JSON.stringify(cameraInputs) !== JSON.stringify(savedSnapshot.cameraInputs) ||
      JSON.stringify(priceOverrides) !== JSON.stringify(savedSnapshot.priceOverrides) ||
      JSON.stringify(serviceOverrides) !== JSON.stringify(savedSnapshot.serviceOverrides) ||
      JSON.stringify(customLineItems) !== JSON.stringify(savedSnapshot.customLineItems) ||
      JSON.stringify(laborRoles) !== JSON.stringify(savedSnapshot.laborRoles ?? DEFAULT_LABOR_ROLES)
    );
  }, [inputs, cameraInputs, priceOverrides, serviceOverrides, customLineItems, laborRoles, savedSnapshot]);

  const selectProject = (id) => {
    setNewPsaProjectId(null);
    if (!id) {
      setInputs({ ...DEFAULT_INPUTS, ...resolveBuilderDefaults({ user, company, configured }) });
      setCameraInputs(DEFAULT_CAMERA_INPUTS);
      setPriceOverrides({});
      setServiceOverrides({});
      setCustomLineItems([]);
      setLaborRoles(DEFAULT_LABOR_ROLES);
      setCurrentProjectId(null);
      setCurrentCrmAccountId(null);
      setSavedSnapshot(null);
      return;
    }
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    const loaded = loadProject(project);
    setCurrentCrmAccountId(loaded.crmAccountId ?? null);
    setInputs(loaded.inputs);
    setCameraInputs(loaded.cameraInputs);
    setPriceOverrides(loaded.priceOverrides);
    setServiceOverrides(loaded.serviceOverrides);
    setCustomLineItems(loaded.customLineItems);
    setLaborRoles(loaded.laborRoles);
    setCurrentProjectId(project.id);
    setSavedSnapshot(loaded);
  };

  const round2 = (n) => Math.round(n * 100) / 100;
  const buildStatePayload = () => ({
    projectName: inputs.propertyName,
    inputs,
    cameraInputs,
    priceOverrides,
    serviceOverrides,
    customLineItems,
    laborRoles,
    crmAccountId: currentCrmAccountId,
    totalPrice: round2((bom.grandTotalPrice ?? 0) + (cameraBom.grandTotalPrice ?? 0)),
    totalCost:  round2((bom.grandTotalCost ?? 0) + (cameraBom.grandTotalCost ?? 0)),
  });

  const snapshotCurrent = () =>
    setSavedSnapshot({ inputs, cameraInputs, priceOverrides, serviceOverrides, customLineItems, laborRoles });

  // Freezes every catalog SKU used by the current (live) bom/cameraBom, right
  // before a quote is first locked (marked Sent). Persisted as catalog_snapshot
  // so a later catalog/discount change never silently reprices this quote.
  const buildCatalogSnapshot = () => {
    const skus = new Set([...bom.items, ...cameraBom.items].map((i) => i.sku).filter(Boolean));
    const snapshot = {};
    for (const sku of skus) {
      const p = allProducts.find((prod) => prod.sku === sku);
      if (p) {
        snapshot[sku] = {
          sku: p.sku,
          desc: p.desc,
          category: p.category,
          cost: p.cost,
          price: p.price,
          vendor: p.vendor,
          preferred_vendor: p.preferred_vendor,
          product_line: p.product_line,
        };
      }
    }
    return snapshot;
  };

  const handleCreateRevision = async () => {
    if (!currentQuote) return;
    setBusy(true);
    try {
      const saved = await saveProject({
        id: null,
        ...buildStatePayload(),
        version: (currentQuote.version ?? 1) + 1,
        parentQuoteId: currentQuote.parent_quote_id ?? currentQuote.id,
      });
      setCurrentProjectId(saved.id);
      snapshotCurrent();
      setToast({ type: 'success', message: `Revision v${saved.version ?? (currentQuote.version ?? 1) + 1} created — you are now editing the new draft.` });
    } catch (e) {
      setToast({ type: 'error', message: `Could not create revision: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  const handleQuoteStatus = async (status) => {
    if (!currentQuote) return;
    try {
      const snapshot = status === 'sent' ? buildCatalogSnapshot() : undefined;
      await setQuoteStatus(currentQuote.id, status, snapshot);
      setToast({ type: 'success', message: status === 'draft' ? 'Quote reopened as draft.' : `Quote marked ${status}.` });
    } catch (e) {
      setToast({ type: 'error', message: `Could not update status: ${e.message}` });
    }
  };

  const handleSave = async () => {
    if (!inputs.propertyName.trim()) {
      setToast({ type: 'error', message: 'Enter a project / property name before saving.' });
      return;
    }
    // Sent/accepted quotes are locked — edits become a new revision so the
    // customer-facing version stays exactly as it was sent.
    if (quoteLocked) {
      setConfirmState({
        title: `Quote is ${quoteStatus}`,
        message: `Version ${currentQuote.version ?? 1} was marked ${quoteStatus} and is locked. Save your changes as revision v${(currentQuote.version ?? 1) + 1}?`,
        confirmLabel: 'Create Revision',
        variant: 'default',
        onConfirm: handleCreateRevision,
      });
      return;
    }
    setBusy(true);
    try {
      const saved = await saveProject({
        id: currentProjectId,
        ...buildStatePayload(),
      });
      setCurrentProjectId(saved.id);
      snapshotCurrent();
      setToast({ type: 'success', message: 'Project saved.' });
    } catch (e) {
      setToast({ type: 'error', message: `Save failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  const exportSections = () => {
    const list = [{ title: 'Managed Wi-Fi', label: 'Wi-Fi', bom, kpis: wifiKpis(bom, term) }];
    if (cameraBom.totalCameras > 0) {
      list.push({
        title: 'Camera Systems',
        label: 'Camera',
        bom: cameraBom,
        kpis: cameraKpis(cameraBom),
      });
    }
    if (labor.serviceItems.length > 0) {
      list.push({ title: 'Professional Labor', label: 'Labor', isLabor: true, bom: labor });
    }
    return list;
  };

  const hasCameras = cameraBom.totalCameras > 0;
  const hasWifi = bom.items.length > 0;
  const systemsTitle =
    hasWifi && hasCameras
      ? 'Wi-Fi & Camera Systems'
      : hasCameras
        ? 'Camera Systems'
        : 'Managed Wi-Fi';

  const handleExportCSV = () =>
    exportCSV(inputs, exportSections(), { fileSuffix: 'Quote', companyName: branding.companyName });

  const handleExportPDF = () =>
    exportPDF(inputs, exportSections(), {
      title: `${systemsTitle} — Budgetary Quote`,
      footerLabel: systemsTitle,
      fileSuffix: 'Quote',
      branding,
    });

  const handleExportProposal = () =>
    exportProposalPDF({ inputs, cameraInputs, term, sections: exportSections(), branding });

  const saveCatalog = async (form) => {
    if (modal.product && !modal.clone) await editProduct(form);
    else await addProduct(form);
  };

  const removeCatalog = (p) => {
    setConfirmState({
      title: 'Delete product',
      message: `Delete ${p.sku} from the catalog?`,
      onConfirm: async () => {
        try { await deleteProduct(p.sku); }
        catch (e) { setToast({ type: 'error', message: e.message }); }
      },
    });
  };

  // --brand/--brand-text are set app-wide by components/BrandingVars.jsx —
  // no need to set them again locally here.
  return (
    <div className="flex flex-col">
      {projectsLoadError && (
        <div className="px-4 pt-3 sm:px-6">
          <ErrorBanner error={projectsLoadError} onRetry={refreshProjects} />
        </div>
      )}

      {/* Compact builder action bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">System Builder</p>
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-slate-900">
                {inputs.propertyName || branding.companyName || 'Untitled Project'}
              </h1>
              {currentQuote && (
                <QuoteLifecycleMenu
                  quote={currentQuote}
                  onTransition={handleQuoteStatus}
                  onRevision={handleCreateRevision}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!hasChanges || busy || (configured && !company)}
              title={configured && !company ? 'Join a team to save projects' : undefined}
              onClick={handleSave}
            >
              <Save size={14} /> {quoteLocked ? 'Save as Revision' : currentProjectId ? 'Update Project' : 'Save Project'}
            </Button>
            {currentProjectId && (() => {
              const linkedProject = newPsaProjectId
                ? { id: newPsaProjectId }
                : psaProjects.find((p) => p.quote_id === currentProjectId);
              return linkedProject ? (
                <a href={`/projects/${linkedProject.id}`}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 size={13} /> View Project
                </a>
              ) : (
                <button type="button"
                  onClick={() => {
                    const quote   = projects.find((p) => p.id === currentProjectId);
                    const account = crmAccounts.find((a) => a.id === currentCrmAccountId);
                    setToProjectForm({
                      name:          quote?.project_name ?? inputs.propertyName ?? '',
                      customer_name: account?.name ?? '',
                      start_date:    '',
                      budget:        String(Math.round((bom.grandTotalPrice ?? 0) + (cameraBom.grandTotalPrice ?? 0))),
                    });
                    setToProjectOpen(true);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                  <FolderKanban size={13} /> → Project
                </button>
              );
            })()}
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Sheet size={14} /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown size={14} /> PDF
            </Button>
            <Button size="sm" onClick={handleExportProposal} title="Customer-facing proposal (sell price only)">
              <FileText size={14} /> Proposal
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[350px]">
          {onCameras ? (
            <CameraInputPanel cameraInputs={cameraInputs} setCameraInputs={setCameraInputs} />
          ) : (
            <InputPanel
              inputs={inputs}
              setInputs={setInputs}
              term={term}
              crmAccounts={crmAccounts}
              crmAccountId={currentCrmAccountId}
              onSelectAccount={setCurrentCrmAccountId}
              onCreateAccount={createCrmAccount}
              projects={projects}
              currentProjectId={currentProjectId}
              onSelectProject={selectProject}
            />
          )}
        </aside>

        <main className="flex-1 space-y-4">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
                  tab === t.id
                    ? 'bg-[var(--brand,#2563eb)] text-[var(--brand-text,#fff)] shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <SummaryCards
            view={dashView}
            bom={bom}
            cameraBom={cameraBom}
            labor={labor}
            term={term}
            canViewMargin={canViewMargin}
          />

          {tab === 'hardware' && (
            <BOMTable
              bom={bom}
              showMargin={showMargin}
              setShowMargin={setShowMargin}
              priceOverrides={priceOverrides}
              setPriceOverrides={setPriceOverrides}
              editPrices={editPrices}
              setEditPrices={setEditPrices}
              canViewMargin={canViewMargin}
              onAddCustom={(seg) => addCustomLine('wifi', seg)}
              onUpdateCustom={updateCustomLine}
              onRemoveCustom={removeCustomLine}
            />
          )}
          {tab === 'services' && (
            <div className="space-y-4">
              {canViewMargin && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowMargin((s) => !s)}>
                    {showMargin ? 'Hide Cost & Margin' : 'Show Cost & Margin'}
                  </Button>
                </div>
              )}
              <LaborTable
                roles={laborRoles}
                setRoles={setLaborRoles}
                showMargin={showMargin}
                canViewMargin={canViewMargin}
                estimatedHours={estimatedHours}
              />
              <p className="px-1 text-xs italic text-slate-400">
                Set hours and rates per worker level — this drives all professional labor on the
                Wi-Fi, camera, and combined quotes.
              </p>
            </div>
          )}
          {tab === 'summary' && (
            <CostSummary
              sections={exportSections()}
              scope={buildScopeOfWork({ inputs, cameraInputs, wifiBom: bom, cameraBom, term })}
              canViewMargin={canViewMargin}
            />
          )}
          {tab === 'cameras' && (
            <CameraSystems
              cameraBom={cameraBom}
              showMargin={showMargin}
              setShowMargin={setShowMargin}
              priceOverrides={priceOverrides}
              setPriceOverrides={setPriceOverrides}
              editPrices={editPrices}
              setEditPrices={setEditPrices}
              canViewMargin={canViewMargin}
              onAddCustom={(seg) => addCustomLine('camera', seg)}
              onUpdateCustom={updateCustomLine}
              onRemoveCustom={removeCustomLine}
            />
          )}
          {tab === 'products' && (
            <ProductDatabase
              allProducts={allProducts}
              canManageCatalog={canManageCatalog}
              canViewMargin={canViewMargin}
              teams={isSuperAdmin ? teams : null}
              teamFilter={catalogTeamId}
              onTeamFilterChange={setCatalogTeamId}
              onAdd={() => setModal({ open: true, product: null })}
              onEdit={(p) => setModal({ open: true, product: p })}
              onClone={(p) =>
                setModal({ open: true, product: { ...p, sku: `${p.sku}-COPY` }, clone: true })
              }
              onDelete={removeCatalog}
              onImport={importProducts}
              onBulkUpdate={canManageCatalog ? bulkUpdateProducts : undefined}
              productLineDiscounts={company?.settings?.productLineDiscounts ?? {}}
            />
          )}
        </main>
      </div>

      {modal.open && (
        <ProductModal
          open={modal.open}
          product={modal.product}
          clone={modal.clone}
          onClose={() => setModal({ open: false, product: null })}
          onSave={saveCatalog}
        />
      )}

      {/* Convert proposal → PSA project modal */}
      {toProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setToProjectOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <FolderKanban size={16} className="text-violet-600" />
                <h2 className="text-sm font-semibold text-slate-900">Create Project from Proposal</h2>
              </div>
              <button type="button" onClick={() => setToProjectOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Project Name *</label>
                <input autoFocus value={toProjectForm.name}
                  onChange={(e) => setToProjectForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Customer</label>
                <input value={toProjectForm.customer_name}
                  onChange={(e) => setToProjectForm((f) => ({ ...f, customer_name: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                  <input type="date" value={toProjectForm.start_date}
                    onChange={(e) => setToProjectForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Budget</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <input type="number" min="0" value={toProjectForm.budget}
                      onChange={(e) => setToProjectForm((f) => ({ ...f, budget: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-slate-200 pl-6 pr-3 text-sm tabular-nums outline-none focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {(() => {
                const techs = [
                  ...(wifiEnabled ? ['Managed Wi-Fi'] : []),
                  ...(camerasEnabled ? ['Camera Systems'] : []),
                ];
                const matched = techs
                  .map((t) => ({ tech: t, template: pickTemplateForTech(allTemplates, t) }))
                  .filter((m) => m.template);
                if (matched.length === 0) return null;
                return (
                  <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <input type="checkbox" className="mt-0.5"
                      checked={toProjectForm.useTemplate}
                      onChange={(e) => setToProjectForm((f) => ({ ...f, useTemplate: e.target.checked }))} />
                    <span>
                      <span className="font-medium text-slate-700">Generate task plan from template</span>
                      <br />
                      {matched.map((m) => `${m.tech}: ${m.template.name}`).join(' · ')}
                    </span>
                  </label>
                );
              })()}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">
              <button type="button" onClick={() => setToProjectOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={toProjectBusy || !toProjectForm.name.trim()}
                onClick={async () => {
                  if (!toProjectForm.name.trim()) return;
                  setToProjectBusy(true);
                  try {
                    const techs = [
                      ...(wifiEnabled ? ['Managed Wi-Fi'] : []),
                      ...(camerasEnabled ? ['Camera Systems'] : []),
                    ];
                    const templatesByTechnology = toProjectForm.useTemplate
                      ? Object.fromEntries(
                          techs
                            .map((t) => [t, pickTemplateForTech(allTemplates, t)])
                            .filter(([, tmpl]) => tmpl)
                        )
                      : {};
                    const proj = await createPSAProject({
                      name:          toProjectForm.name.trim(),
                      customer_name: toProjectForm.customer_name.trim() || null,
                      start_date:    toProjectForm.start_date || null,
                      budget:        toProjectForm.budget ? Number(toProjectForm.budget) : null,
                      quote_id:      currentProjectId,
                      status:        'planning',
                      technologies:  techs,
                      templatesByTechnology,
                    });
                    setNewPsaProjectId(proj.id);
                    setToProjectOpen(false);
                  } catch (e) { setToast({ type: 'error', message: e.message }); }
                  finally { setToProjectBusy(false); }
                }}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                {toProjectBusy ? <Loader2 size={13} className="animate-spin" /> : <FolderKanban size={13} />}
                {toProjectBusy ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        variant={confirmState?.variant}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function BuilderPage() {
  return (
    <AuthGuard>
      <OSShell>
        <Calculator />
      </OSShell>
    </AuthGuard>
  );
}
