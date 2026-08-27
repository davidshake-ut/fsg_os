'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { Save, FolderKanban, CheckCircle2, X, Loader2, Building2, Sheet, FileDown } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useBranding } from '@/hooks/useBranding';
import SummaryCards from '@/components/SummaryCards';
import ProductDatabase from '@/components/ProductDatabase';
import ProductModal from '@/components/ProductModal';
import SkuRenameProposalsModal from '@/components/SkuRenameProposalsModal';
import PropertyOverview from '@/components/builder/PropertyOverview';
import TechnologyPage from '@/components/builder/TechnologyPage';
import TechVendorsCard from '@/components/builder/TechVendorsCard';
import { getCalculator } from '@/components/builder/calculators';
import { companyTechVendors, resolveQuoteVendors, linesForVendor, newVendorId, primaryVendorCandidates } from '@/lib/vendors';
import { primarySections } from '@/lib/vendorComparison';
import CostSummary from '@/components/CostSummary';
import { publishBuilderTechs, publishBuilderActiveTab } from '@/lib/builderNavStore';
import { Button } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CloneOptionModal from '@/components/CloneOptionModal';
import QuoteLifecycleMenu from '@/components/QuoteLifecycleMenu';
import AppToast from '@/components/ui/AppToast';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { calculateBOM } from '@/lib/calculateBOM';
import { buildWifiTakeoff } from '@/lib/wifiTakeoff';
import { resolvePricingPolicy, applyPricingPolicy } from '@/lib/pricingPolicy';
import { DEFAULT_LABOR_TASKS, normalizeLaborTasks } from '@/lib/laborTasks';
import { buildQuoteSummary } from '@/lib/optionComparison';
import { calculateCameraBOM } from '@/lib/calculateCameraBOM';
import { calculateTechBOM } from '@/lib/calculateTechBOM';
import { calculateLabor } from '@/lib/calculateLabor';
import { estimateLaborHours } from '@/lib/estimateLaborHours';
import { companyTechnologies, resolveEnabledTechnologies } from '@/lib/technologies';
import { useProducts } from '@/hooks/useProducts';
import { useProjects } from '@/hooks/useProjects';
import { usePSAProjects } from '@/hooks/usePSAProjects';
import { useCRMAccounts } from '@/hooks/useCRMAccounts';
import { useProperties } from '@/hooks/useProperties';
import { useTemplates } from '@/hooks/useTemplates';
import { systemTemplatesForTech } from '@/lib/templates/index';
import { DEFAULT_INPUTS, DEFAULT_CAMERA_INPUTS, DEFAULT_LABOR_ROLES } from '@/lib/defaults';
import { getTerminology } from '@/lib/terminology';
import { exportPDF, wifiKpis, cameraKpis } from '@/lib/exportPDF';
import { exportProposalPDF } from '@/lib/exportProposal';
import { exportCSV } from '@/lib/exportCSV';
import { buildScopeOfWork } from '@/lib/scopeOfWork';
import { cn } from '@/lib/utils';

// Tabs are dynamic: Overview first, one tab per technology enabled on this
// quote (registry order, company custom techs last), Product Database at the
// end. Each technology's design surface routes through the mini-calculator
// registry (components/builder/calculators): a registered calculator renders
// its own input panel + computed system; everything else gets the generic
// TechnologyPage parts picker.

// Prefer a company-owned template over the built-in system one for a given
// technology, so a team's customized version wins once they've made one.
function pickTemplateForTech(allTemplates, technology) {
  const matches = allTemplates.filter((t) => t.technology === technology);
  return matches.find((t) => !t.isSystem) ?? matches.find((t) => t.isSystem) ?? null;
}

const PROPERTY_TYPE_LABELS = { hospitality: 'Hospitality', senior_living: 'Senior Living', multifamily: 'Multi-Family' };

// Id for hand-added quote lines — only ever called from user-event handlers.
const newCustomId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Compact who/where strip shown under the sub-tabs on every technology page —
// the property context travels with you; editing it happens on the Overview.
function BuilderContextBar({ inputs, accountName, onEditOverview }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/70 bg-white px-4 py-2 text-xs shadow-sm shadow-slate-900/[0.03]">
      <Building2 size={13} className="shrink-0 text-slate-400" />
      {accountName && <span className="font-medium text-slate-600">{accountName}</span>}
      {accountName && <span className="text-slate-300">·</span>}
      <span className="font-semibold text-slate-800">{inputs.propertyName || 'Untitled property'}</span>
      <span className="text-slate-300">·</span>
      <span className="text-slate-500">{PROPERTY_TYPE_LABELS[inputs.propertyType] ?? inputs.propertyType}</span>
      {inputs.propertyAddress && (
        <>
          <span className="text-slate-300">·</span>
          <span className="truncate text-slate-500">{inputs.propertyAddress}</span>
        </>
      )}
      <button type="button" onClick={onEditOverview}
        className="ml-auto shrink-0 font-medium text-blue-600 hover:underline">
        Edit on Overview
      </button>
    </div>
  );
}

function Calculator() {
  const { configured, session, company, user, isSuperAdmin, isAdmin, isViewer, role, refresh } =
    useSession();

  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [cameraInputs, setCameraInputs] = useState(DEFAULT_CAMERA_INPUTS);
  const [priceOverrides, setPriceOverrides] = useState({});
  const [customLineItems, setCustomLineItems] = useState([]);
  const [laborRoles, setLaborRoles] = useState(DEFAULT_LABOR_ROLES);
  const [activeTab, setActiveTab] = useState('overview');
  const [showMargin, setShowMargin] = useState(false);
  const [editPrices, setEditPrices] = useState(false);
  // Cost/margin/profit are internal figures — a plain 'user' role never sees
  // them (local mode has no roles, so it's always the single operator).
  const canViewMargin = configured ? isAdmin : true;
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [cloneOpen, setCloneOpen] = useState(false); // design option clone prompt (0068)
  const [modal, setModal] = useState({ open: false, product: null });
  const [busy, setBusy] = useState(false);
  const [currentCrmAccountId, setCurrentCrmAccountId] = useState(null);
  const [currentPropertyId, setCurrentPropertyId] = useState(null);

  const [catalogTeamId, setCatalogTeamId] = useState('all');
  const [teams, setTeams] = useState([]);
  // After a super-admin SKU rename: { from, to, companyId } drives the
  // "update proposals?" migration modal.
  const [skuRename, setSkuRename] = useState(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!(isSuperAdmin && session && supabase)) return;
    void (async () => {
      const { data } = await supabase.from('companies').select('id, name').order('name');
      setTeams(data || []);
    })();
  }, [isSuperAdmin, session]);

  const { branding, setBranding } = useBranding({ configured, company, onSaved: refresh });
  const { accounts: crmAccounts, createAccount: createCrmAccount } = useCRMAccounts(session, company, user);
  const { properties, createProperty } = useProperties(session, company, currentCrmAccountId);
  const { allProducts, addProduct, editProduct, deleteProduct, importProducts, bulkUpdateProducts } = useProducts(
    session,
    { teamFilter: catalogTeamId }
  );
  const { projects, loadError: projectsLoadError, refresh: refreshProjects, loadProject, saveProject, setQuoteStatus, deleteProject, cloneAsOption } = useProjects(session, company, user);
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
  const [toProjectForm,  setToProjectForm]  = useState({ name: '', customer_name: '', start_date: '', budget: '', equipment: null, laborBudget: null, useTemplate: true });

  // The PSA project this proposal (or its property — one project per
  // property, migration 0040) already spawned, if any. Drives the header's
  // View Project / → Project toggle and the accepted-without-project nudge.
  const linkedProject = newPsaProjectId
    ? { id: newPsaProjectId }
    : (psaProjects.find((p) => p.quote_id === currentProjectId)
       ?? (currentPropertyId ? psaProjects.find((p) => p.property_id === currentPropertyId) : null)
       ?? null);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  // A super admin can edit/delete/add products in ANY team's catalog (the
  // API honors their target_company_id); team admins manage their own only.
  const canManageCatalog = configured
    ? isSuperAdmin || (role === 'company_admin' && !!company)
    : true;

  // Takeoff mode: the Wi-Fi design comes from the Digital Infrastructure
  // property model plus this quote's coverage settings (inputs.wifiTakeoff).
  // Pricing policy (Phase 5): the team's cost-plus markups with this
  // quote's mode choice. Every path that PRICES reads the priced catalog;
  // the Product Database keeps list prices (it is also the catalog editor).
  const pricingPolicy = useMemo(
    () => resolvePricingPolicy(company?.settings, inputs.pricingPolicy),
    [company?.settings, inputs.pricingPolicy]
  );
  const pricedProducts = useMemo(() => applyPricingPolicy(allProducts, pricingPolicy), [allProducts, pricingPolicy]);
  // Labor task table (Phase 5): the team's, else the built-in defaults.
  const laborTasks = useMemo(
    () => normalizeLaborTasks(company?.settings?.laborTasks) ?? DEFAULT_LABOR_TASKS,
    [company?.settings?.laborTasks]
  );
  const wifiTakeoff = useMemo(
    () =>
      inputs.wifiTakeoff?.enabled
        ? buildWifiTakeoff(inputs.techCalc?.digital_infrastructure, inputs.wifiTakeoff, {
            kitsQuoted: resolveEnabledTechnologies(inputs).digital_infrastructure === true,
          })
        : null,
    [inputs]
  );
  const bom = useMemo(
    () =>
      calculateBOM(
        inputs,
        priceOverrides,
        {}, // legacy serviceOverrides slot — ignored by the engine
        pricedProducts,
        customLineItems.filter((c) => c.system === 'wifi'),
        catalogSnapshot,
        wifiTakeoff
      ),
    [inputs, priceOverrides, pricedProducts, customLineItems, catalogSnapshot, wifiTakeoff]
  );

  // Per-technology enablement (registry ids). Legacy quotes derive it from
  // includeWifi/includeCameras; toggling writes the map AND mirrors the two
  // legacy flags so automations/older readers keep working through Tier 1.
  const enabledTechMap = useMemo(() => resolveEnabledTechnologies(inputs), [inputs]);
  const allTechs = useMemo(() => companyTechnologies(company), [company]);
  const techTabs = useMemo(() => allTechs.filter((t) => enabledTechMap[t.id]), [allTechs, enabledTechMap]);
  const setTechEnabled = (techId, enabled) =>
    setInputs((prev) => {
      const map = { ...resolveEnabledTechnologies(prev), [techId]: enabled };
      return {
        ...prev,
        technologies: map,
        includeWifi: map.managed_wifi === true,
        includeCameras: map.video_surveillance === true,
      };
    });

  const wifiEnabled = enabledTechMap.managed_wifi === true;
  const camerasEnabled = enabledTechMap.video_surveillance === true;
  const includeShipping = inputs.includeShipping !== false;
  const shippingPercent = inputs.shippingPercent ?? 7;

  // Tier-2 mini-calculator design inputs, keyed by tech id inside the
  // quote's inputs jsonb (inputs.techCalc) — save/load/revisions carry them
  // like any other input. Defaults come from the calculator itself.
  const techCalcValue = (techId) => ({
    ...(getCalculator(techId)?.defaults ?? {}),
    ...(inputs.techCalc?.[techId] ?? {}),
  });
  const setTechCalcInputs = (techId, patch) =>
    setInputs((prev) => ({
      ...prev,
      techCalc: {
        ...(prev.techCalc ?? {}),
        [techId]: { ...(prev.techCalc?.[techId] ?? {}), ...patch },
      },
    }));

  // Vendors resolved per enabled tech: registry ∩ this quote's enablement,
  // primary flagged, engine host = registry[0] on the legacy-calculator techs.
  const techVendorMap = useMemo(() => {
    const out = {};
    for (const t of techTabs) {
      out[t.id] = resolveQuoteVendors(inputs, company, t.id, !!getCalculator(t.id)?.legacy);
    }
    return out;
  }, [techTabs, inputs, company]);

  const setTechVendorPrimary = (techId, vendorId) =>
    setInputs((prev) => ({
      ...prev,
      techVendorPrimary: { ...(prev.techVendorPrimary ?? {}), [techId]: vendorId },
    }));

  const setTechVendorEnabled = (techId, vendor, on) => {
    const current = techVendorMap[techId] ?? [];
    if (!on && current.length === 1) {
      setToast({ type: 'error', message: 'At least one vendor stays enabled — enable another first.' });
      return;
    }
    const apply = () =>
      setInputs((prev) => {
        const list = on
          ? [...current.map(({ id, name }) => ({ id, name })), { id: vendor.id, name: vendor.name }]
          : current.filter((v) => v.id !== vendor.id).map(({ id, name }) => ({ id, name }));
        return { ...prev, techVendors: { ...(prev.techVendors ?? {}), [techId]: list } };
      });
    if (!on) {
      // Lines on the disabled vendor's tab re-bucket to the primary (or the
      // next remaining vendor) — make that visible before it happens.
      const remaining = current.filter((v) => v.id !== vendor.id);
      const landing = remaining.find((v) => v.isPrimary) ?? remaining[0];
      const moved = customLineItems.filter((c) => c.system === techId && c.vendor === vendor.id);
      if (moved.length > 0 && landing) {
        const total = moved.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
        setConfirmState({
          title: `Disable ${vendor.name} on this quote?`,
          message: `${moved.length} line${moved.length !== 1 ? 's' : ''} totaling $${Math.round(total).toLocaleString()} will move to ${landing.name}'s tab.`,
          confirmLabel: 'Disable vendor',
          onConfirm: apply,
        });
        return;
      }
    }
    apply();
  };

  // Company custom technologies (admin-managed, settings jsonb — same
  // pattern as productLineDiscounts).
  const saveCustomTechs = async (list) => {
    const supabase = getSupabase();
    if (!supabase || !company?.id) return;
    const settings = { ...(company.settings ?? {}), customTechnologies: list };
    const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
    if (error) { setToast({ type: 'error', message: error.message }); return; }
    await refresh?.().catch(() => {});
  };
  const addCustomTech = async (label) => {
    const id = `custom_${(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8)}`;
    await saveCustomTechs([...(company?.settings?.customTechnologies ?? []), { id, label }]);
    setTechEnabled(id, true);
  };
  const renameCustomTech = async (id, label) =>
    saveCustomTechs((company?.settings?.customTechnologies ?? []).map((t) => (t.id === id ? { ...t, label } : t)));
  const removeCustomTech = async (id) => {
    // One combined settings write (dropping the tech AND its vendor registry)
    // — two sequential writes would each spread the other's stale settings.
    const supabase = getSupabase();
    if (!supabase || !company?.id) return;
    const vendors = { ...(company.settings?.technologyVendors ?? {}) };
    delete vendors[id];
    const settings = {
      ...(company.settings ?? {}),
      customTechnologies: (company.settings?.customTechnologies ?? []).filter((t) => t.id !== id),
      technologyVendors: vendors,
    };
    const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
    if (error) { setToast({ type: 'error', message: error.message }); return; }
    await refresh?.().catch(() => {});
    setTechEnabled(id, false);
  };

  // ── Per-technology vendor registry (companies.settings.technologyVendors —
  //    same admin-settings pattern as custom technologies). The entry name
  //    IS the custom_products.vendor match string. ─────────────────────────
  const saveTechVendors = async (techId, list) => {
    const supabase = getSupabase();
    if (!supabase || !company?.id) return false;
    const map = { ...(company.settings?.technologyVendors ?? {}) };
    if (list.length === 0) delete map[techId];
    else map[techId] = list;
    const settings = { ...(company.settings ?? {}), technologyVendors: map };
    const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
    if (error) { setToast({ type: 'error', message: error.message }); return false; }
    await refresh?.().catch(() => {});
    return true;
  };
  const addTechVendor = (techId, name) =>
    saveTechVendors(techId, [...companyTechVendors(company, techId), { id: newVendorId(), name }]);
  const renameTechVendor = async (techId, id, name) => {
    const list = companyTechVendors(company, techId);
    const old = list.find((v) => v.id === id);
    if (!old || old.name === name) return;
    const ok = await saveTechVendors(techId, list.map((v) => (v.id === id ? { ...v, name } : v)));
    if (!ok) return;
    // Retag the vendor's catalog products so the tabs/pickers keep matching.
    const rows = allProducts.filter((p) => p.vendor === old.name);
    if (rows.length === 0) return;
    try {
      await bulkUpdateProducts(rows.map((p) => ({
        sku: p.sku,
        description: p.desc,
        category: p.category,
        technology: p.technology,
        cost: p.cost,
        price: p.price,
        vendor: name,
        preferred_vendor: p.preferred_vendor ?? '',
        product_line: p.product_line ?? '',
      })));
      setToast({ type: 'success', message: `Renamed to ${name} — ${rows.length} product${rows.length !== 1 ? 's' : ''} retagged.` });
    } catch (e) {
      setToast({ type: 'error', message: `Vendor renamed, but retagging products failed: ${e.message}` });
    }
  };
  const removeTechVendor = (techId, id) =>
    saveTechVendors(techId, companyTechVendors(company, techId).filter((v) => v.id !== id));

  // Lines a registered mini-calculator derives from its design inputs —
  // stamped with the tech id + fromCalculator so calculateTechBOM and the
  // System Design table can tell them from hand-added lines.
  const techCalcLines = useMemo(() => {
    const out = {};
    for (const t of techTabs) {
      const calc = getCalculator(t.id);
      if (!calc?.compute) continue;
      const value = { ...(calc.defaults ?? {}), ...(inputs.techCalc?.[t.id] ?? {}) };
      // `inputs` rides along so a calculator can read cross-technology
      // settings (Digital Infrastructure's in-unit drops follow the Wi-Fi
      // coverage rules in inputs.wifiTakeoff).
      out[t.id] = (calc.compute(value, { products: pricedProducts, inputs }) ?? [])
        .filter((l) => (Number(l.qty) || 0) > 0)
        .map((l) => ({ ...l, system: t.id, fromCalculator: true }));
    }
    return out;
  }, [techTabs, inputs, pricedProducts]);

  // BOM-shaped sections for every non-legacy, NON-vendored technology tab:
  // the tech's calculator-derived lines (if any) plus the quote's own line
  // entries. Legacy engines own their BOMs above; vendored techs roll up
  // per-vendor in vendorBoms below.
  const techBoms = useMemo(() => {
    const out = {};
    for (const t of techTabs) {
      if (getCalculator(t.id)?.legacy || (techVendorMap[t.id] ?? []).length > 0) continue;
      out[t.id] = calculateTechBOM(
        t.id,
        [...(techCalcLines[t.id] ?? []), ...customLineItems],
        { includeShipping, shippingPercent }
      );
    }
    return out;
  }, [techTabs, techVendorMap, techCalcLines, customLineItems, includeShipping, shippingPercent]);

  // Per-vendor BOMs for vendored techs. The engine vendor is excluded (its
  // BOM is the legacy bom/cameraBom); calculator-derived lines feed the
  // primary vendor's bucket; every other line lands via the coalescing rule.
  const vendorBoms = useMemo(() => {
    const out = {};
    for (const t of techTabs) {
      const vendors = techVendorMap[t.id] ?? [];
      if (vendors.length === 0) continue;
      const enabledIds = vendors.map((v) => v.id);
      const primaryId = vendors.find((v) => v.isPrimary)?.id;
      out[t.id] = {};
      for (const v of vendors) {
        if (v.isEngine) continue;
        const lines = [
          ...(v.isPrimary ? techCalcLines[t.id] ?? [] : []),
          ...linesForVendor(customLineItems, t.id, v.id, enabledIds, primaryId),
        ];
        out[t.id][v.id] = calculateTechBOM(t.id, lines, { includeShipping, shippingPercent });
      }
    }
    return out;
  }, [techTabs, techVendorMap, techCalcLines, customLineItems, includeShipping, shippingPercent]);

  const cameraBom = useMemo(
    () =>
      calculateCameraBOM(
        camerasEnabled ? cameraInputs : {},
        priceOverrides,
        {}, // legacy serviceOverrides slot — ignored by the engine
        pricedProducts,
        camerasEnabled ? customLineItems.filter((c) => c.system === 'camera') : [],
        { includeShipping, shippingPercent, catalogSnapshot }
      ),
    [
      camerasEnabled,
      cameraInputs,
      priceOverrides,
      pricedProducts,
      customLineItems,
      includeShipping,
      shippingPercent,
      catalogSnapshot,
    ]
  );

  // Per-role labor hours contributed by registered mini-calculators.
  const techLaborContributions = useMemo(() => {
    const list = [];
    for (const t of techTabs) {
      const calc = getCalculator(t.id);
      if (!calc?.laborHours || calc.legacy) continue;
      const value = { ...(calc.defaults ?? {}), ...(inputs.techCalc?.[t.id] ?? {}) };
      list.push(calc.laborHours(value, techBoms[t.id]));
    }
    return list;
  }, [techTabs, inputs, techBoms]);

  const estimatedHours = useMemo(
    () => estimateLaborHours({ wifiBom: bom, cameraBom, inputs, cameraInputs, techContributions: techLaborContributions, tasks: laborTasks }),
    [bom, cameraBom, inputs, cameraInputs, techLaborContributions, laborTasks]
  );
  const labor = useMemo(
    () => calculateLabor(laborRoles, estimatedHours),
    [laborRoles, estimatedHours]
  );

  const addCustomLine = (system, segment) =>
    setCustomLineItems((prev) => [
      ...prev,
      { id: newCustomId(), system, segment, sku: '', description: '', qty: 1, cost: 0, price: 0 },
    ]);
  const updateCustomLine = (id, field, value) =>
    setCustomLineItems((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  const removeCustomLine = (id) =>
    setCustomLineItems((prev) => prev.filter((c) => c.id !== id));
  // Generic technology pages store their picked/custom lines in the same
  // customLineItems bucket, keyed by the tech's registry id (the two
  // calculators keep their legacy 'wifi'/'camera' keys for saved quotes).
  const addTechLine = (techId, line, vendorId = null) =>
    setCustomLineItems((prev) => [
      ...prev,
      {
        id: newCustomId(),
        system: techId,
        segment: 'Accessories',
        ...(vendorId ? { vendor: vendorId } : {}),
        ...line,
      },
    ]);
  const term = getTerminology(inputs.propertyType);

  const visibleTabs = [
    { id: 'overview', label: 'Overview' },
    ...techTabs.map((t) => ({ id: t.id, label: t.label })),
    { id: 'products', label: 'Product Database' },
  ];
  const tab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : 'overview';

  const activeTech = techTabs.find((t) => t.id === tab) ?? null;

  // Each technology page has its own sub-tabs: Overview (that tech's
  // summary + exports), the design surface — one tab per enabled VENDOR when
  // the tech has a vendor registry, else a single tab named after the tech —
  // and a Product Database preset to that tech (and vendor). Keyed by tech
  // id so switching technologies always lands on the sub-overview.
  const [subTabState, setSubTabState] = useState({ techId: null, id: 'overview', vendorId: null });
  const subTab = activeTech && subTabState.techId === activeTech.id ? subTabState.id : 'overview';
  const setSubTab = (id, vendorId = null) =>
    setSubTabState({ techId: activeTech?.id ?? null, id, vendorId });

  const activeCalc = activeTech ? getCalculator(activeTech.id) : null;
  const activeTechVendors = activeTech ? techVendorMap[activeTech.id] ?? [] : [];
  const vendored = activeTechVendors.length > 0;
  const activeVendor =
    vendored && subTab.startsWith('vendor:')
      ? activeTechVendors.find((v) => `vendor:${v.id}` === subTab) ?? null
      : null;
  // Which surface hosts the legacy calculator UI (rail + Body): the engine
  // vendor's tab when vendored, the classic 'builder' tab otherwise.
  const engineSurface = activeCalc?.legacy
    ? vendored
      ? activeVendor?.isEngine === true
      : subTab === 'builder'
    : false;
  // Standard (non-legacy) calculators design into the primary vendor's tab.
  const showCalcRail =
    !!activeCalc &&
    (activeCalc.legacy
      ? engineSurface
      : vendored
        ? activeVendor?.isPrimary === true
        : subTab === 'builder');
  const onCameras = activeCalc?.legacy === 'camera';
  const onWifi = activeCalc?.legacy === 'wifi';
  const dashView = onWifi ? 'wifi' : onCameras ? 'cameras' : 'both';

  // Keep the sidebar's Builder sub-nav in sync with this quote's toggles
  // and highlight the sub-link matching the tab the user is actually on.
  useEffect(() => {
    publishBuilderTechs(techTabs.map((t) => t.id));
  }, [techTabs]);
  useEffect(() => {
    publishBuilderActiveTab(tab);
  }, [tab]);

  const hasChanges = useMemo(() => {
    if (!savedSnapshot) {
      return (
        Object.keys(priceOverrides).length > 0 ||
        customLineItems.length > 0 ||
        currentCrmAccountId != null ||
        currentPropertyId != null ||
        JSON.stringify(inputs) !== JSON.stringify(DEFAULT_INPUTS) ||
        JSON.stringify(cameraInputs) !== JSON.stringify(DEFAULT_CAMERA_INPUTS) ||
        JSON.stringify(laborRoles) !== JSON.stringify(DEFAULT_LABOR_ROLES)
      );
    }
    return (
      // Association changes (customer/property) count as changes too — a
      // proposal that gains a customer must be saveable as a revision.
      currentCrmAccountId !== (savedSnapshot.crmAccountId ?? null) ||
      currentPropertyId !== (savedSnapshot.propertyId ?? null) ||
      JSON.stringify(inputs) !== JSON.stringify(savedSnapshot.inputs) ||
      JSON.stringify(cameraInputs) !== JSON.stringify(savedSnapshot.cameraInputs) ||
      JSON.stringify(priceOverrides) !== JSON.stringify(savedSnapshot.priceOverrides) ||
      JSON.stringify(customLineItems) !== JSON.stringify(savedSnapshot.customLineItems) ||
      JSON.stringify(laborRoles) !== JSON.stringify(savedSnapshot.laborRoles ?? DEFAULT_LABOR_ROLES)
    );
  }, [inputs, cameraInputs, priceOverrides, customLineItems, laborRoles, currentCrmAccountId, currentPropertyId, savedSnapshot]);

  // Loads a quote row into the Builder's state — from the projects list, or
  // a row just returned by the hook (a freshly cloned design option, before
  // the list has re-fetched).
  const applyLoadedProject = (project) => {
    const loaded = loadProject(project);
    setCurrentCrmAccountId(loaded.crmAccountId ?? null);
    setCurrentPropertyId(loaded.propertyId ?? null);
    setInputs(loaded.inputs);
    setCameraInputs(loaded.cameraInputs);
    setPriceOverrides(loaded.priceOverrides);
    setCustomLineItems(loaded.customLineItems);
    setLaborRoles(loaded.laborRoles);
    setCurrentProjectId(project.id);
    setSavedSnapshot(loaded);
  };

  const selectProject = (id) => {
    setNewPsaProjectId(null);
    if (!id) {
      setInputs(DEFAULT_INPUTS);
      setCameraInputs(DEFAULT_CAMERA_INPUTS);
      setPriceOverrides({});
      setCustomLineItems([]);
      setLaborRoles(DEFAULT_LABOR_ROLES);
      setCurrentProjectId(null);
      setCurrentCrmAccountId(null);
      setCurrentPropertyId(null);
      setSavedSnapshot(null);
      setActiveTab('overview'); // a fresh proposal always starts on Overview
      return;
    }
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    applyLoadedProject(project);
  };

  // ── URL params — the deep-link contract other pages rely on ────────────
  // ?project=<id>            load that proposal (account 360°, ⌘K, project pages)
  // ?project=<id>&createProject=1  …and open the Create Project modal
  // ?account=<id>[&property=<id>]  pre-seed a NEW proposal for that customer
  // ?tab=<id>                open a specific builder tab (sidebar sub-nav)
  // Each applies exactly once, after the data it needs has loaded.
  const searchParams = useSearchParams();
  const urlApplied = useRef(false);
  const [pendingCreateProject, setPendingCreateProject] = useState(false);

  // Re-applies on every change (not once): the sidebar sub-nav navigates by
  // ?tab= while already on /builder.
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam) setActiveTab(tabParam);
  }, [tabParam]);
  useEffect(() => {
    if (urlApplied.current) return;
    const projectParam = searchParams.get('project');
    const accountParam = searchParams.get('account');
    if (!projectParam && !accountParam) { urlApplied.current = true; return; }
    if (projectParam) {
      if (projects.length === 0) return; // quotes still loading
      urlApplied.current = true;
      if (projects.some((p) => p.id === projectParam)) {
        selectProject(projectParam);
        if (searchParams.get('createProject') === '1') setPendingCreateProject(true);
      }
      return;
    }
    if (crmAccounts.length === 0) return; // accounts still loading
    urlApplied.current = true;
    if (crmAccounts.some((a) => a.id === accountParam)) {
      setCurrentCrmAccountId(accountParam);
      const propertyParam = searchParams.get('property');
      if (propertyParam) setCurrentPropertyId(propertyParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, projects, crmAccounts]);

  // One section per enabled technology — or per enabled VENDOR on vendored
  // techs (primary first). With ≥2 vendors the sections carry optionGroup/
  // isPrimary so consumers can treat alternates as Option B rather than
  // additive dollars; a single enabled vendor stays plain (legacy shape).
  // (Declared before the totals helpers below — the React Compiler rejects
  // forward references.)
  const sectionsForTech = (t) => {
    const legacy = getCalculator(t.id)?.legacy;
    const vendors = techVendorMap[t.id] ?? [];
    const wifiSection = (title) => ({ title, label: 'Wi-Fi', bom, kpis: wifiKpis(bom, term), techId: t.id });
    const cameraSection = (title) =>
      cameraBom.totalCameras > 0
        ? { title, label: 'Camera', bom: cameraBom, kpis: cameraKpis(cameraBom), techId: t.id }
        : null;

    if (vendors.length === 0) {
      if (legacy === 'wifi') return [wifiSection(t.label)];
      if (legacy === 'camera') {
        const s = cameraSection(t.label);
        return s ? [s] : [];
      }
      const tb = techBoms[t.id];
      return tb && (tb.items.length > 0 || tb.serviceItems.length > 0)
        ? [{ title: t.label, label: t.label, bom: tb, techId: t.id }]
        : [];
    }

    const multi = vendors.length > 1;
    const ordered = [...vendors].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    const out = [];
    for (const v of ordered) {
      const title = multi ? `${t.label} — ${v.name}` : t.label;
      let s = null;
      if (v.isEngine && legacy === 'wifi') s = wifiSection(title);
      else if (v.isEngine && legacy === 'camera') s = cameraSection(title);
      else {
        const vb = vendorBoms[t.id]?.[v.id];
        if (vb && (vb.items.length > 0 || vb.serviceItems.length > 0)) {
          s = { title, label: t.label, bom: vb, techId: t.id };
        }
      }
      if (!s) continue;
      out.push(
        multi
          ? { ...s, optionGroup: t.id, techLabel: t.label, isPrimary: v.isPrimary, vendorId: v.id, vendorName: v.name }
          : s
      );
    }
    return out;
  };
  // Every section, alternates included — CostSummary / exportPDF /
  // exportProposal / exportCSV render Option-B alternates badged with a
  // comparison table (lib/vendorComparison.js) and keep them out of totals.
  // Anything that PERSISTS money or parts goes through primarySections().
  const exportSections = () => {
    const list = techTabs.flatMap(sectionsForTech);
    if (labor.serviceItems.length > 0) {
      list.push({ title: 'Professional Labor', label: 'Labor', isLabor: true, bom: labor });
    }
    return list;
  };

  const round2 = (n) => Math.round(n * 100) / 100;
  // Saved quote totals = the primary sections only — an Option-B alternate
  // is the same system quoted twice and must never inflate total_price.
  const primaryTotals = () => {
    const secs = primarySections(exportSections()).filter((s) => !s.isLabor);
    return {
      price: round2(secs.reduce((sum, s) => sum + (s.bom.grandTotalPrice ?? 0), 0)),
      cost: round2(secs.reduce((sum, s) => sum + (s.bom.grandTotalCost ?? 0), 0)),
    };
  };
  const buildStatePayload = () => {
    const totals = primaryTotals();
    return {
      projectName: inputs.propertyName,
      inputs,
      cameraInputs,
      priceOverrides,
      customLineItems,
      laborRoles,
      crmAccountId: currentCrmAccountId,
      propertyId: currentPropertyId,
      totalPrice: totals.price,
      totalCost: totals.cost,
      // Design options (0068): keep the option identity on saves and
      // revisions, and write the summary the options comparison reads.
      ...(currentQuote?.option_group_id
        ? { optionGroupId: currentQuote.option_group_id, optionLabel: currentQuote.option_label ?? null }
        : {}),
      summary: buildQuoteSummary({
        sections: exportSections(),
        labor,
        bom,
        inputs,
        pricingMode: pricingPolicy.mode,
        unitsHint: inputs.numberOfRooms,
      }),
    };
  };

  // The Project/Property Name IS the property: find it (case-insensitive)
  // among the chosen customer's properties, or create it on the fly. Keeps
  // the Account -> Property -> Proposal chain without a separate picker.
  const resolvePropertyId = async () => {
    if (!currentCrmAccountId) return null;
    const name = (inputs.propertyName || '').trim();
    if (!name) return null;
    const existing = properties.find((p) => p.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    try {
      const created = await createProperty({
        crmAccountId: currentCrmAccountId,
        name,
        address: (inputs.propertyAddress || '').trim() || null,
      });
      return created?.id ?? null;
    } catch {
      return null; // property linkage is best-effort; the save itself must not fail on it
    }
  };

  // Prefill + open the Create Project modal for the loaded proposal. Shared
  // by the header "→ Project" button and the ?createProject=1 deep-link.
  // (Also fixes a latent bug: the old inline prefill dropped useTemplate
  // from the form state, silently unchecking template auto-generation.)
  const openCreateProjectModal = () => {
    const quote   = projects.find((p) => p.id === currentProjectId);
    const account = crmAccounts.find((a) => a.id === currentCrmAccountId);
    // Budget prefill = the quote's primary sections: equipment (hardware +
    // shipping across every technology) + the professional-labor section —
    // carried separately so the project gets the Equipment/Labor breakdown.
    const equipment = Math.round(primaryTotals().price);
    const laborTotal = Math.round(labor.grandTotalPrice ?? 0);
    setToProjectForm({
      name:          quote?.project_name ?? inputs.propertyName ?? '',
      customer_name: account?.name ?? '',
      start_date:    '',
      budget:        String(equipment + laborTotal),
      equipment,
      laborBudget:   laborTotal,
      useTemplate:   true,
    });
    setToProjectOpen(true);
  };

  useEffect(() => {
    if (!pendingCreateProject || !currentProjectId) return;
    setPendingCreateProject(false);
    openCreateProjectModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreateProject, currentProjectId]);

  // `overrides` covers values resolved during the save itself (e.g. the
  // auto-created property id) — the state setter hasn't re-rendered yet, so
  // closing over state alone would snapshot the stale value and leave the
  // save button lit after a successful save.
  const snapshotCurrent = (overrides = {}) =>
    setSavedSnapshot({
      inputs, cameraInputs, priceOverrides, customLineItems, laborRoles,
      crmAccountId: currentCrmAccountId, propertyId: currentPropertyId,
      ...overrides,
    });

  // Freezes every catalog SKU used by the current (live) bom/cameraBom, right
  // before a quote is first locked (marked Sent). Persisted as catalog_snapshot
  // so a later catalog/discount change never silently reprices this quote.
  const buildCatalogSnapshot = () => {
    // Keyed by the line's IDENTITY (baseSku) — the engines look snapshots up
    // by the literal SKUs they reference, which a display alias never changes.
    const skus = new Set([...bom.items, ...cameraBom.items].map((i) => i.baseSku ?? i.sku).filter(Boolean));
    const snapshot = {};
    for (const sku of skus) {
      const p = pricedProducts.find((prod) => prod.sku === sku || prod.baseSku === sku);
      if (p) {
        snapshot[sku] = {
          sku: p.sku,
          desc: p.desc,
          category: p.category,
          technology: p.technology,
          cost: p.cost,
          price: p.price,
          vendor: p.vendor,
          preferred_vendor: p.preferred_vendor,
          product_line: p.product_line,
          // Builder attributes (0061) — the engine re-resolves tag-based
          // selections from this frozen snapshot on locked quotes.
          mount_type: p.mount_type ?? null,
          quality_tier: p.quality_tier ?? null,
          port_count: p.port_count ?? null,
          poe_watts: p.poe_watts ?? null,
          poe_budget_watts: p.poe_budget_watts ?? null,
          license_sku_1yr: p.license_sku_1yr ?? null,
          license_sku_3yr: p.license_sku_3yr ?? null,
          license_sku_5yr: p.license_sku_5yr ?? null,
        };
      }
    }
    return snapshot;
  };

  const handleCreateRevision = async () => {
    if (!currentQuote) return;
    setBusy(true);
    try {
      const propertyId = (await resolvePropertyId()) ?? currentPropertyId;
      setCurrentPropertyId(propertyId);
      const saved = await saveProject({
        id: null,
        ...buildStatePayload(),
        propertyId,
        version: (currentQuote.version ?? 1) + 1,
        parentQuoteId: currentQuote.parent_quote_id ?? currentQuote.id,
      });
      setCurrentProjectId(saved.id);
      snapshotCurrent({ propertyId });
      setToast({ type: 'success', message: `Revision v${saved.version ?? (currentQuote.version ?? 1) + 1} created — you are now editing the new draft.` });
    } catch (e) {
      setToast({ type: 'error', message: `Could not create revision: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  // Design options (0068): save the current design, fork it into a labeled
  // sibling on the same property, and switch to editing the clone.
  const optionLetter = (n) => String.fromCharCode(65 + Math.min(25, Math.max(0, n)));
  const suggestedOptionLabel = () => {
    const gid = currentQuote?.option_group_id;
    const count = gid
      ? new Set(projects.filter((p) => p.option_group_id === gid).map((p) => p.parent_quote_id ?? p.id)).size
      : 1;
    return `Option ${optionLetter(count)}`;
  };
  const handleCloneAsOption = async (label) => {
    if (!currentQuote) return;
    setBusy(true);
    try {
      const propertyId = (await resolvePropertyId()) ?? currentPropertyId;
      setCurrentPropertyId(propertyId);
      // A locked quote is cloned as it stands; a draft is saved first so the
      // clone carries the latest design.
      const source = quoteLocked
        ? currentQuote
        : await saveProject({ id: currentProjectId, ...buildStatePayload(), propertyId });
      const clone = await cloneAsOption(source, { label });
      setCloneOpen(false);
      applyLoadedProject(clone);
      setActiveTab('overview');
      setToast({ type: 'success', message: `Option “${label}” created — you are editing it now. Compare the options on the Proposals page.` });
    } catch (e) {
      setToast({ type: 'error', message: `Could not clone this proposal: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  // The as-sold line items, persisted at Sent and refreshed at Accepted so
  // downstream features (installed equipment on projects/tickets, asset
  // generation) can read the parts list from the DB. Client-side recompute
  // (lib/calculateBOM.js) remains the source of truth while drafting.
  const buildBomSnapshot = () => {
    // Built from the primary sections: alternates (Option B) never reach
    // installed equipment or asset generation. vendor + source ride along
    // as the future purchase-order grouping keys.
    const catalogBySku = new Map(allProducts.map((p) => [p.sku, p]));
    return primarySections(exportSections())
      .filter((s) => !s.isLabor)
      .flatMap((s) =>
        s.bom.items.map((i) => ({ ...i, system: s.techId, vendorName: s.vendorName ?? null }))
      )
      .filter((i) => (i.qty ?? 0) > 0)
      .map((i) => ({
        system: i.system,
        sku: i.sku ?? null,
        description: i.description ?? '',
        category: i.category ?? 'Miscellaneous',
        qty: i.qty,
        unitPrice: i.unitPrice ?? 0,
        totalPrice: i.totalPrice ?? 0,
        vendor: i.vendorName ?? (i.sku ? catalogBySku.get(i.sku)?.vendor || null : null),
        source: i.sku ? catalogBySku.get(i.sku)?.preferred_vendor || null : null,
      }));
  };

  const handleQuoteStatus = async (status) => {
    if (!currentQuote) return;
    try {
      const snapshot = status === 'sent' ? buildCatalogSnapshot() : undefined;
      const bomSnap = status === 'sent' || status === 'accepted' ? buildBomSnapshot() : undefined;
      await setQuoteStatus(currentQuote.id, status, snapshot, bomSnap);
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
      const propertyId = (await resolvePropertyId()) ?? currentPropertyId;
      setCurrentPropertyId(propertyId);
      const saved = await saveProject({
        id: currentProjectId,
        ...buildStatePayload(),
        propertyId,
      });
      setCurrentProjectId(saved.id);
      snapshotCurrent({ propertyId });
      setToast({ type: 'success', message: 'Proposal saved.' });
    } catch (e) {
      setToast({ type: 'error', message: `Save failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  // One section per enabled technology with content, in registry order,
  // Professional Labor last. This array is the single seam feeding the
  // Overview summary, exportPDF, exportProposal, and exportCSV. The Wi-Fi
  // and Camera labels are kept for the proposal PDF's scope grouping.

  const presentTitles = primarySections(exportSections()).filter((s) => !s.isLabor).map((s) => s.title);
  const systemsTitle = presentTitles.length > 2
    ? `${presentTitles[0]} + ${presentTitles.length - 1} more systems`
    : presentTitles.join(' & ') || 'System';

  const handleExportCSV = () =>
    exportCSV(inputs, exportSections(), { fileSuffix: 'Quote', companyName: branding.companyName });

  const handleExportPDF = () =>
    exportPDF(inputs, exportSections(), {
      title: `${systemsTitle} — Budgetary Quote`,
      footerLabel: systemsTitle,
      fileSuffix: 'Quote',
      branding,
    });

  // Per-technology documents from a tech page's sub-overview — just that
  // system's section (labor stays on the whole-proposal exports).
  const techFileSuffix = (t) => `${t.label.replace(/[^a-zA-Z0-9]/g, '')}_Quote`;
  const techDocSections = (t) => sectionsForTech(t);
  const handleExportTechCSV = (t) => {
    const secs = techDocSections(t);
    if (secs.length === 0) { setToast({ type: 'error', message: `Nothing on the ${t.label} quote yet.` }); return; }
    exportCSV(inputs, secs, { fileSuffix: techFileSuffix(t), companyName: branding.companyName });
  };
  const handleExportTechPDF = (t) => {
    const secs = techDocSections(t);
    if (secs.length === 0) { setToast({ type: 'error', message: `Nothing on the ${t.label} quote yet.` }); return; }
    exportPDF(inputs, secs, {
      title: `${t.label} — Budgetary Quote`,
      footerLabel: t.label,
      fileSuffix: techFileSuffix(t),
      branding,
    });
  };

  // "Create Proposal" = persist the version + generate the customer PDF
  // (proposal + scope of work) + attach a copy to the proposal record so it
  // shows on the Proposals tab. Re-running it on an already-proposed or
  // locked version rolls a new version; the old one stays in the archive.
  const handleCreateProposal = async () => {
    if (!inputs.propertyName.trim()) {
      setToast({ type: 'error', message: 'Enter a project / property name before creating a proposal.' });
      return;
    }
    setBusy(true);
    try {
      const propertyId = (await resolvePropertyId()) ?? currentPropertyId;
      setCurrentPropertyId(propertyId);
      let saved;
      if (!currentProjectId) {
        saved = await saveProject({ id: null, ...buildStatePayload(), propertyId });
        setCurrentProjectId(saved.id);
      } else if (quoteLocked || currentQuote?.pdf_path) {
        saved = await saveProject({
          id: null,
          ...buildStatePayload(),
          propertyId,
          version: (currentQuote?.version ?? 1) + 1,
          parentQuoteId: currentQuote?.parent_quote_id ?? currentQuote?.id ?? null,
        });
        setCurrentProjectId(saved.id);
      } else {
        saved = await saveProject({ id: currentProjectId, ...buildStatePayload(), propertyId });
      }
      snapshotCurrent({ propertyId });

      const doc = exportProposalPDF({ inputs, cameraInputs, term, sections: exportSections(), branding });

      let attached = false;
      const supabase = getSupabase();
      if (supabase && company?.id && saved?.id) {
        const path = `${company.id}/${saved.id}/Proposal-v${saved.version ?? 1}.pdf`;
        const { error: upErr } = await supabase.storage
          .from('proposal-files')
          .upload(path, doc.output('blob'), { upsert: true, contentType: 'application/pdf' });
        if (!upErr) {
          const { error: linkErr } = await supabase.from('saved_projects').update({ pdf_path: path }).eq('id', saved.id);
          attached = !linkErr;
        }
        await refreshProjects();
      }
      setToast({
        type: 'success',
        message: `Proposal v${saved.version ?? 1} created${attached ? ' — PDF saved to the Proposals tab' : ''}.`,
      });
    } catch (e) {
      setToast({ type: 'error', message: `Could not create proposal: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  const saveCatalog = async (form) => {
    if (modal.product && !modal.clone) {
      // Super admin changed the SKU: custom products truly rename (then
      // offer proposal migration); base products get a per-team display
      // alias (identity unchanged — proposals keep working untouched).
      const newSku = form.sku.trim();
      const identity = modal.product.baseSku ?? modal.product.sku;
      if (isSuperAdmin && newSku !== modal.product.sku) {
        if (modal.product.isCustom) {
          await editProduct({ ...form, sku: newSku, rename_from: identity });
          setSkuRename({
            from: identity,
            to: newSku,
            companyId: catalogTeamId && catalogTeamId !== 'all' ? catalogTeamId : company?.id,
          });
        } else if (newSku === identity) {
          // Restoring the original base SKU — clear the alias.
          await editProduct({ ...form, sku: identity, display_sku: null });
          setToast({ type: 'success', message: `SKU restored to ${identity}.` });
        } else {
          await editProduct({ ...form, sku: newSku, rename_from: identity });
          setToast({ type: 'success', message: `${identity} now shows as ${newSku} for this team — quotes and exports pick it up automatically.` });
        }
      } else {
        // Always write against the IDENTITY sku — for an aliased base
        // product, form.sku is the display alias and would otherwise
        // upsert a bogus row under the alias.
        await editProduct({ ...form, sku: identity });
      }
    } else {
      await addProduct(form);
    }
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

  // Shared bag handed to calculator components — see the contract in
  // components/builder/calculators/index.js.
  // Discard in-progress BOM edits: line overrides and custom lines return to
  // the last saved state (or empty on a never-saved proposal).
  const discardBomChanges = () => {
    setPriceOverrides(savedSnapshot?.priceOverrides ?? {});
    setCustomLineItems(savedSnapshot?.customLineItems ?? []);
  };

  const calcCtx = {
    inputs, setInputs, term,
    cameraInputs, setCameraInputs,
    bom, cameraBom, labor,
    showMargin, setShowMargin,
    priceOverrides, setPriceOverrides,
    editPrices, setEditPrices,
    canViewMargin,
    addCustomLine, updateCustomLine, removeCustomLine,
    discardBomChanges,
    products: pricedProducts,
    pricingPolicy,
    wifiTakeoff,
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

      {/* Flow nudge: an accepted proposal is the one that becomes the
          project — make the next step unmissable. */}
      {quoteStatus === 'accepted' && !linkedProject && !isViewer && (
        <div className="px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">This proposal was accepted.</span> Create its project to kick off delivery — templates and schedule generate automatically.
            </p>
            <Button size="sm" onClick={openCreateProjectModal}>
              <FolderKanban size={14} /> Create Project
            </Button>
          </div>
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
              {currentQuote && !isViewer && (
                <QuoteLifecycleMenu
                  quote={currentQuote}
                  onTransition={handleQuoteStatus}
                  onRevision={handleCreateRevision}
                  onCloneOption={() => setCloneOpen(true)}
                />
              )}
              {currentQuote?.option_label && (
                <a
                  href="/proposals"
                  title="Design option — compare the options on the Proposals page"
                  className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"
                >
                  {currentQuote.option_label}
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!hasChanges || busy || isViewer || (configured && !company)}
              title={isViewer ? 'View-only role — saving is disabled' : configured && !company ? 'Join a team to save proposals' : undefined}
              onClick={handleSave}
            >
              <Save size={14} /> {quoteLocked ? 'Save as Revision' : currentProjectId ? 'Update Proposal' : 'Save Proposal'}
            </Button>
            {currentProjectId && (
              linkedProject ? (
                <a href={`/projects/${linkedProject.id}`}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 size={13} /> View Project
                </a>
              ) : !isViewer && (
                <button type="button"
                  onClick={openCreateProjectModal}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                  <FolderKanban size={13} /> → Project
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        {showCalcRail && (
          <aside className="w-full shrink-0 lg:w-[350px]">
            <activeCalc.InputPanel
              value={techCalcValue(activeTech.id)}
              onChange={(patch) => setTechCalcInputs(activeTech.id, patch)}
              products={pricedProducts}
              ctx={calcCtx}
            />
          </aside>
        )}

        <main className="flex-1 space-y-4">
          {activeTech ? (
            /* Per-technology sub-tabs: this tech's overview, its design
               surface, and its slice of the Product Database. Switching
               technologies happens in the left sidebar. */
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/70 bg-white p-1 shadow-sm shadow-slate-900/[0.03]">
              {[
                { id: 'overview', label: 'Overview' },
                ...(vendored
                  ? activeTechVendors.map((v) => ({ id: `vendor:${v.id}`, label: v.name }))
                  : [{ id: 'builder', label: activeTech.label }]),
                { id: 'products', label: 'Product Database' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubTab(t.id, t.id === 'products' ? activeVendor?.id ?? null : null)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
                    subTab === t.id
                      ? 'bg-[var(--brand,#2563eb)] text-[var(--brand-text,#fff)] shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
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
          )}

          {activeTech && (
            <BuilderContextBar
              inputs={inputs}
              accountName={crmAccounts.find((a) => a.id === currentCrmAccountId)?.name ?? null}
              onEditOverview={() => setActiveTab('overview')}
            />
          )}

          {activeTech && subTab === 'overview' && (
            <>
              {(onWifi || onCameras) && (
                <SummaryCards
                  view={dashView}
                  bom={bom}
                  cameraBom={cameraBom}
                  labor={labor}
                  term={term}
                  canViewMargin={canViewMargin}
                />
              )}
              <TechVendorsCard
                tech={activeTech}
                registry={companyTechVendors(company, activeTech.id)}
                quoteVendors={activeTechVendors}
                catalogVendors={primaryVendorCandidates(allProducts, activeTech.id)}
                hasEngine={!!activeCalc?.legacy}
                isAdmin={configured ? isAdmin : true}
                canWrite={!isViewer}
                onAddVendor={(name) => addTechVendor(activeTech.id, name)}
                onRenameVendor={(id, name) => renameTechVendor(activeTech.id, id, name)}
                onRemoveVendor={(id) => removeTechVendor(activeTech.id, id)}
                onToggleVendor={(v, on) => setTechVendorEnabled(activeTech.id, v, on)}
                onSetPrimary={(id) => setTechVendorPrimary(activeTech.id, id)}
              />
              {(() => {
                const secs = techDocSections(activeTech);
                return secs.length > 0 ? (
                  <CostSummary sections={secs} canViewMargin={canViewMargin} />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
                    Nothing quoted for {activeTech.label} yet — open the {vendored ? 'vendor' : activeTech.label} tab to start designing.
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExportTechCSV(activeTech)}>
                  <Sheet size={14} /> {activeTech.label} CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportTechPDF(activeTech)}>
                  <FileDown size={14} /> {activeTech.label} PDF
                </Button>
              </div>
            </>
          )}

          {tab === 'overview' && (
            <PropertyOverview
              inputs={inputs}
              setInputs={setInputs}
              company={company}
              isAdmin={configured ? isAdmin : true}
              crmAccounts={crmAccounts}
              crmAccountId={currentCrmAccountId}
              onSelectAccount={(id) => { setCurrentCrmAccountId(id); setCurrentPropertyId(null); }}
              onCreateAccount={createCrmAccount}
              properties={properties}
              projects={projects}
              currentProjectId={currentProjectId}
              onSelectProject={selectProject}
              enabledTechs={enabledTechMap}
              onToggleTech={setTechEnabled}
              onAddCustomTech={addCustomTech}
              onRenameCustomTech={renameCustomTech}
              onRemoveCustomTech={removeCustomTech}
              sections={exportSections()}
              scope={buildScopeOfWork({ inputs, cameraInputs, wifiBom: bom, cameraBom, term })}
              canViewMargin={canViewMargin}
              laborRoles={laborRoles}
              setLaborRoles={setLaborRoles}
              estimatedHours={estimatedHours}
              onCreateProposal={handleCreateProposal}
              onExportCSV={handleExportCSV}
              onExportPDF={handleExportPDF}
              busy={busy}
            />
          )}
          {activeTech && showCalcRail && !activeCalc?.legacy && activeCalc?.Surface && (
            <activeCalc.Surface
              value={techCalcValue(activeTech.id)}
              onChange={(patch) => setTechCalcInputs(activeTech.id, patch)}
              products={pricedProducts}
              ctx={calcCtx}
            />
          )}
          {activeTech && engineSurface && activeCalc?.Body && <activeCalc.Body ctx={calcCtx} />}
          {activeTech &&
            (vendored
              ? activeVendor && !activeVendor.isEngine
              : subTab === 'builder' && !activeCalc?.Body) && (
              <TechnologyPage
                techId={activeTech.id}
                label={activeTech.label}
                vendorName={activeVendor?.name ?? ''}
                primaryNames={companyTechVendors(company, activeTech.id).map((v) => v.name)}
                products={pricedProducts}
                computedLines={!vendored || activeVendor?.isPrimary ? techCalcLines[activeTech.id] ?? [] : []}
                lines={
                  vendored
                    ? linesForVendor(
                        customLineItems,
                        activeTech.id,
                        activeVendor.id,
                        activeTechVendors.map((v) => v.id),
                        activeTechVendors.find((v) => v.isPrimary)?.id
                      )
                    : customLineItems.filter((c) => c.system === activeTech.id)
                }
                bom={vendored ? vendorBoms[activeTech.id]?.[activeVendor.id] : techBoms[activeTech.id]}
                canViewMargin={canViewMargin}
                onAddLine={(line) => addTechLine(activeTech.id, line, activeVendor?.id ?? null)}
                onUpdateLine={updateCustomLine}
                onRemoveLine={removeCustomLine}
              />
            )}
          {activeTech && subTab === 'products' && (
            <ProductDatabase
              key={`techdb-${activeTech.id}-${subTabState.vendorId ?? 'all'}`}
              initialTechFilter={activeTech.id}
              initialVendorFilter={activeTechVendors.find((v) => v.id === subTabState.vendorId)?.name ?? ''}
              allProducts={allProducts}
              canManageCatalog={canManageCatalog}
              canViewMargin={canViewMargin}
              company={company}
              teams={isSuperAdmin ? teams : null}
              superAdmin={isSuperAdmin}
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
              onBulkDelete={canManageCatalog ? deleteProduct : undefined}
              productLineDiscounts={company?.settings?.productLineDiscounts ?? {}}
            />
          )}
          {tab === 'products' && (
            <ProductDatabase
              allProducts={allProducts}
              canManageCatalog={canManageCatalog}
              canViewMargin={canViewMargin}
              company={company}
              teams={isSuperAdmin ? teams : null}
              superAdmin={isSuperAdmin}
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
              onBulkDelete={canManageCatalog ? deleteProduct : undefined}
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
          company={company}
          allProducts={allProducts}
          superAdmin={isSuperAdmin}
          defaultTechnology={activeTech ? activeTech.id : 'managed_wifi'}
          onClose={() => setModal({ open: false, product: null })}
          onSave={saveCatalog}
        />
      )}

      <SkuRenameProposalsModal
        key={skuRename ? `${skuRename.from}->${skuRename.to}` : 'idle'}
        rename={skuRename}
        onClose={() => setSkuRename(null)}
        onToast={setToast}
      />

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
                const techs = [...new Set(techTabs.map((t) => t.label))];
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
                    const techs = [...new Set(techTabs.map((t) => t.label))];
                    const templatesByTechnology = toProjectForm.useTemplate
                      ? Object.fromEntries(
                          techs
                            .map((t) => [t, pickTemplateForTech(allTemplates, t)])
                            .filter(([, tmpl]) => tmpl)
                        )
                      : {};
                    const proj = await createPSAProject({
                      name:           toProjectForm.name.trim(),
                      customer_name:  toProjectForm.customer_name.trim() || null,
                      start_date:     toProjectForm.start_date || null,
                      budget:         toProjectForm.budget ? Number(toProjectForm.budget) : null,
                      equipment_budget: toProjectForm.equipment ?? null,
                      labor_budget:     toProjectForm.laborBudget ?? null,
                      quote_id:       currentProjectId,
                      crm_account_id: currentCrmAccountId,
                      property_id:    currentPropertyId,
                      status:         'planning',
                      technologies:   techs,
                      templatesByTechnology,
                    });
                    setNewPsaProjectId(proj.id);
                    setToProjectOpen(false);
                  } catch (e) {
                    // One project per property (unique index, 0040) — if a
                    // teammate created it between our check and insert, link
                    // to theirs instead of erroring.
                    if (e?.code === '23505' && currentPropertyId) {
                      const supabase = getSupabase();
                      const { data: existing } = await supabase
                        .from('psa_projects').select('id')
                        .eq('property_id', currentPropertyId).maybeSingle();
                      if (existing) {
                        setNewPsaProjectId(existing.id);
                        setToProjectOpen(false);
                        setToast({ type: 'success', message: 'This property already has a project — linked to it.' });
                      } else {
                        setToast({ type: 'error', message: e.message });
                      }
                    } else {
                      setToast({ type: 'error', message: e.message });
                    }
                  }
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
      <CloneOptionModal
        open={cloneOpen}
        sourceLabel={currentQuote?.option_label ?? ''}
        suggested={suggestedOptionLabel()}
        busy={busy}
        onConfirm={handleCloneAsOption}
        onCancel={() => setCloneOpen(false)}
      />
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
        <Suspense fallback={null}>
          <Calculator />
        </Suspense>
      </OSShell>
    </AuthGuard>
  );
}
