'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { DEFAULT_INPUTS, DEFAULT_CAMERA_INPUTS, DEFAULT_LABOR_ROLES } from '@/lib/defaults';
import { logActivity } from '@/lib/activityLog';
import { runAutomations } from '@/lib/automations';

// In local mode (no Supabase) projects are persisted to localStorage so the
// user can still save and reopen projects. Rows use the same column shape as
// the saved_projects table (project_name, inputs, price_overrides, …) so the
// rest of the app treats local and remote projects identically.
//
// The local store is exposed via useSyncExternalStore so reads are
// hydration-safe (server snapshot is empty, matching SSR) and update without
// synchronous setState-in-effect.
const LOCAL_KEY = 'wifibuilder.projects';
const EMPTY_LOCAL = [];
const localListeners = new Set();
let localCache = null; // last parsed array (stable reference between changes)
let localCacheRaw = null; // raw string localCache was parsed from

function getLocalSnapshot() {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(LOCAL_KEY);
  if (raw === localCacheRaw && localCache !== null) return localCache;
  localCacheRaw = raw;
  try {
    const parsed = JSON.parse(raw);
    localCache = Array.isArray(parsed) ? parsed : EMPTY_LOCAL;
  } catch {
    localCache = EMPTY_LOCAL;
  }
  return localCache;
}

function getLocalServerSnapshot() {
  return EMPTY_LOCAL;
}

function subscribeLocal(callback) {
  localListeners.add(callback);
  const onStorage = (e) => {
    if (e.key === LOCAL_KEY || e.key === null) callback();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    localListeners.delete(callback);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

function writeLocal(list) {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(list);
  window.localStorage.setItem(LOCAL_KEY, raw);
  localCache = list;
  localCacheRaw = raw;
  localListeners.forEach((cb) => cb());
}

// Fresh mutable copy of the local list for save/delete (never mutate the
// snapshot reference React is holding).
function readLocalArray() {
  return [...getLocalSnapshot()];
}

function newLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// CRUD over saved_projects. RLS scopes rows to the user's company
// (super_admin sees all), so we never filter by company on the client.
export function useProjects(session, company, user) {
  const supabase = getSupabase();
  const localProjects = useSyncExternalStore(subscribeLocal, getLocalSnapshot, getLocalServerSnapshot);
  const [remoteProjects, setRemoteProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const projects = supabase ? remoteProjects : localProjects;

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('saved_projects')
      .select('*')
      .order('updated_at', { ascending: false });
    setLoadError(error?.message ?? null);
    if (!error) setRemoteProjects(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) return;
    void (async () => {
      await refresh();
    })();
  }, [supabase, session, refresh]);

  // Merge with DEFAULT_INPUTS so projects saved before a field existed still load.
  const loadProject = useCallback((project) => {
    return {
      inputs: { ...DEFAULT_INPUTS, ...(project.inputs || {}) },
      cameraInputs: { ...DEFAULT_CAMERA_INPUTS, ...(project.camera_inputs || {}) },
      priceOverrides: project.price_overrides || {},
      customLineItems: project.custom_line_items || [],
      laborRoles:
        Array.isArray(project.labor_roles) && project.labor_roles.length
          ? project.labor_roles
          : DEFAULT_LABOR_ROLES,
      crmAccountId: project.crm_account_id ?? null,
      propertyId: project.property_id ?? null,
    };
  }, []);

  const saveProject = useCallback(
    async ({
      id,
      projectName,
      inputs,
      cameraInputs,
      priceOverrides,
      customLineItems,
      laborRoles,
      crmAccountId = null,
      propertyId = null,
      totalPrice = null,
      totalCost = null,
      version,
      parentQuoteId,
      // Design options (0068) + the per-save summary the comparison reads —
      // only sent when provided, like the lifecycle fields.
      optionGroupId,
      optionLabel,
      optionNotes,
      summary,
    }) => {
      // Lifecycle fields only sent when provided so plain saves never clobber
      // an existing status/version.
      const lifecycle = {
        ...(totalPrice != null ? { total_price: totalPrice } : {}),
        ...(totalCost != null ? { total_cost: totalCost } : {}),
        ...(version != null ? { version } : {}),
        ...(parentQuoteId !== undefined ? { parent_quote_id: parentQuoteId } : {}),
        ...(optionGroupId !== undefined ? { option_group_id: optionGroupId } : {}),
        ...(optionLabel !== undefined ? { option_label: optionLabel } : {}),
        ...(optionNotes !== undefined ? { option_notes: optionNotes } : {}),
        ...(summary !== undefined ? { summary } : {}),
      };
      if (!supabase) {
        const now = new Date().toISOString();
        const list = readLocalArray();
        let saved;
        if (id) {
          const idx = list.findIndex((p) => p.id === id);
          saved = {
            ...(idx >= 0 ? list[idx] : {}),
            id,
            project_name: projectName,
            inputs,
            camera_inputs: cameraInputs,
            price_overrides: priceOverrides,
            custom_line_items: customLineItems,
            labor_roles: laborRoles,
            crm_account_id: crmAccountId,
            property_id: propertyId,
            ...lifecycle,
            updated_at: now,
          };
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
        } else {
          saved = {
            id: newLocalId(),
            project_name: projectName,
            inputs,
            camera_inputs: cameraInputs,
            price_overrides: priceOverrides,
            custom_line_items: customLineItems,
            labor_roles: laborRoles,
            crm_account_id: crmAccountId,
            property_id: propertyId,
            status: 'draft',
            version: 1,
            ...lifecycle,
            created_at: now,
            updated_at: now,
          };
          list.push(saved);
        }
        list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        writeLocal(list);
        return saved;
      }
      const payload = {
        project_name: projectName,
        inputs,
        camera_inputs: cameraInputs,
        price_overrides: priceOverrides,
        custom_line_items: customLineItems,
        labor_roles: laborRoles,
        crm_account_id: crmAccountId,
        property_id: propertyId,
        company_id: company?.id ?? null,
        ...lifecycle,
        updated_at: new Date().toISOString(),
      };
      let result;
      if (id) {
        result = await supabase.from('saved_projects').update(payload).eq('id', id).select().single();
      } else {
        result = await supabase
          .from('saved_projects')
          .insert({ ...payload, created_by: user?.id ?? null })
          .select()
          .single();
      }
      if (result.error) throw result.error;
      await refresh();
      return result.data;
    },
    [supabase, company, user, refresh]
  );

  // Quote lifecycle transition. Stamps the matching timestamp so reporting
  // can measure sent→accepted cycle time later. Snapshots (both passed by
  // the Builder from its live BOM at the moment of transition):
  //   - catalogSnapshot: frozen SKU pricing, so later catalog changes never
  //     reprice a sent/accepted/declined quote.
  //   - bomSnapshot: the as-sold line items, persisted so downstream
  //     features (support's installed-equipment view, asset generation)
  //     can read "what was sold" from the DB instead of recomputing.
  const setQuoteStatus = useCallback(
    async (id, status, catalogSnapshot, bomSnapshot) => {
      const now = new Date().toISOString();
      const stamp =
        status === 'sent' ? { sent_at: now }
        : status === 'accepted' ? { accepted_at: now }
        : status === 'declined' ? { declined_at: now }
        : {};
      const snapshotPatch = {
        ...(catalogSnapshot ? { catalog_snapshot: catalogSnapshot } : {}),
        ...(bomSnapshot ? { bom_snapshot: bomSnapshot } : {}),
      };
      if (!supabase) {
        writeLocal(readLocalArray().map((p) =>
          p.id === id ? { ...p, status, ...stamp, ...snapshotPatch, updated_at: now } : p
        ));
        return;
      }
      const { error } = await supabase
        .from('saved_projects')
        .update({ status, ...stamp, ...snapshotPatch, updated_at: now })
        .eq('id', id);
      if (error) throw error;
      const quote = projects.find((p) => p.id === id);
      const quoteName = quote?.project_name ?? 'Quote';
      await logActivity(supabase, {
        companyId: company?.id, actorId: user?.id,
        verb: `quote.${status}`, entityType: 'quote', entityId: id,
        label: `${quoteName} marked ${status}`,
      });
      await runAutomations(supabase, {
        companyId: company?.id, triggerType: 'quote.status_changed',
        entity: { ...quote, id, status, title: quoteName },
      });
      await refresh();
    },
    [supabase, refresh, projects, company, user]
  );

  // Design options (0068): fork a quote into a labeled sibling on the same
  // property. The source joins the group ("Option A" unless it already has
  // a label); the clone starts as a fresh draft with the same design.
  const cloneAsOption = useCallback(
    async (source, { label }) => {
      const groupId =
        source.option_group_id ??
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp_${Date.now().toString(16)}`);
      const sourceLabel = source.option_label || 'Option A';
      const now = new Date().toISOString();
      const copy = {
        project_name: source.project_name,
        inputs: source.inputs ?? {},
        camera_inputs: source.camera_inputs ?? {},
        price_overrides: source.price_overrides ?? {},
        custom_line_items: source.custom_line_items ?? [],
        labor_roles: source.labor_roles ?? [],
        crm_account_id: source.crm_account_id ?? null,
        property_id: source.property_id ?? null,
        total_price: source.total_price ?? null,
        total_cost: source.total_cost ?? null,
        summary: source.summary ?? null,
        status: 'draft',
        version: 1,
        parent_quote_id: null,
        option_group_id: groupId,
        option_label: label,
        option_notes: null,
      };
      if (!supabase) {
        const list = readLocalArray().map((p) =>
          p.id === source.id && !p.option_group_id ? { ...p, option_group_id: groupId, option_label: sourceLabel } : p
        );
        const saved = { id: newLocalId(), ...copy, created_at: now, updated_at: now };
        list.push(saved);
        list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        writeLocal(list);
        return saved;
      }
      if (!source.option_group_id) {
        const { error } = await supabase
          .from('saved_projects')
          .update({ option_group_id: groupId, option_label: sourceLabel })
          .eq('id', source.id);
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from('saved_projects')
        .insert({ ...copy, company_id: company?.id ?? null, created_by: user?.id ?? null, updated_at: now })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data;
    },
    [supabase, company, user, refresh]
  );

  // The label / customer note on one option.
  const setOptionMeta = useCallback(
    async (id, { optionLabel, optionNotes }) => {
      const patch = {
        ...(optionLabel !== undefined ? { option_label: optionLabel } : {}),
        ...(optionNotes !== undefined ? { option_notes: optionNotes } : {}),
      };
      if (!supabase) {
        writeLocal(readLocalArray().map((p) => (p.id === id ? { ...p, ...patch } : p)));
        return;
      }
      const { error } = await supabase.from('saved_projects').update(patch).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteProject = useCallback(
    async (id) => {
      if (!supabase) {
        writeLocal(readLocalArray().filter((p) => p.id !== id));
        return;
      }
      await supabase.from('saved_projects').delete().eq('id', id);
      await refresh();
    },
    [supabase, refresh]
  );

  return { projects, loading, loadError, refresh, loadProject, saveProject, setQuoteStatus, deleteProject, cloneAsOption, setOptionMeta };
}
