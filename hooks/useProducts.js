'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mergeProducts } from '@/lib/mergeProducts';
import { BASE_PRODUCTS, CORE_SKUS } from '@/lib/catalog';

const baseSkus = new Set(BASE_PRODUCTS.map((p) => p.sku));

// Local-mode catalog edits (no Supabase). Rows mirror the custom_products table
// shape and are persisted to localStorage, exposed reactively via
// useSyncExternalStore (hydration-safe + no setState-in-effect). The mutation
// semantics mirror app/api/products/route.js: add = insert, edit = upsert by
// sku, delete = hard-delete custom / soft-delete base (core SKUs protected).
const LOCAL_KEY = 'wifibuilder.custom_products';
const EMPTY_LOCAL = [];
const localListeners = new Set();
let localCache = null;
let localCacheRaw = null;

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

function writeLocal(rows) {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(rows);
  window.localStorage.setItem(LOCAL_KEY, raw);
  localCache = rows;
  localCacheRaw = raw;
  localListeners.forEach((cb) => cb());
}

function readLocalArray() {
  return [...getLocalSnapshot()];
}

// Loads custom_products and merges them over the static base catalog.
// In local mode the custom rows come from localStorage instead.
export function useProducts(session, { teamFilter = 'all' } = {}) {
  const supabase = getSupabase();
  const localRows = useSyncExternalStore(subscribeLocal, getLocalSnapshot, getLocalServerSnapshot);
  const [remoteRows, setRemoteRows] = useState([]);
  const rawRows = supabase ? remoteRows : localRows;
  // A super admin's read returns every team's custom rows (by RLS); scope the
  // catalog to the team chosen in the Product Database filter. 'all' = no filter
  // (and a regular user's rows are already team-scoped, so this is a no-op).
  const customRows =
    supabase && teamFilter && teamFilter !== 'all'
      ? rawRows.filter((r) => r.company_id === teamFilter)
      : rawRows;

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('custom_products').select('*');
    setRemoteRows(data || []);
  }, [supabase]);

  useEffect(() => {
    if (!(isSupabaseConfigured && session)) return;
    void (async () => {
      await refresh();
    })();
  }, [session, refresh]);

  // Privileged mutations go through the service-role route handler, which
  // re-checks the caller's role (company_admin / super_admin).
  const callApi = useCallback(
    async (method, body) => {
      if (!supabase || !session) throw new Error('Not authenticated');
      const res = await fetch('/api/products', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `Request failed (${res.status})`);
      }
      await refresh();
      return res.json();
    },
    [supabase, session, refresh]
  );

  // --- local-mode mutations (mirror the API handlers) ---
  const addLocal = ({ sku, description, category, technology = '', cost, price, vendor = '', preferred_vendor = '', product_line = '' }) => {
    if (!sku || !description || !category) throw new Error('Missing fields');
    const rows = readLocalArray();
    const existing = rows.find((r) => r.sku === sku);
    const isBase = baseSkus.has(sku);
    const liveBase = isBase && !existing;
    if (liveBase || (existing && !existing.is_deleted)) {
      throw new Error(`SKU ${sku} already exists`);
    }
    writeLocal([
      ...rows.filter((r) => r.sku !== sku),
      { sku, description, category, technology, cost: Number(cost), price: Number(price), vendor, preferred_vendor, product_line, is_custom: !isBase, is_deleted: false },
    ]);
  };

  const editLocal = ({ sku, description, category, technology = '', cost, price, vendor = '', preferred_vendor = '', product_line = '' }) => {
    if (!sku) throw new Error('Missing sku');
    const isBase = baseSkus.has(sku);
    writeLocal([
      ...readLocalArray().filter((r) => r.sku !== sku),
      { sku, description, category, technology, cost: Number(cost), price: Number(price), vendor, preferred_vendor, product_line, is_custom: !isBase, is_deleted: false },
    ]);
  };

  const deleteLocal = (sku) => {
    if (CORE_SKUS.has(sku)) throw new Error(`${sku} is a core product and cannot be deleted`);
    const rows = readLocalArray().filter((r) => r.sku !== sku);
    if (baseSkus.has(sku)) {
      // Soft-delete a (non-core) base product so the engine/catalog hide it.
      rows.push({ sku, description: sku, category: 'Miscellaneous', cost: 0, price: 0, is_custom: false, is_deleted: true });
    }
    writeLocal(rows);
  };

  // Bulk upsert from a CSV import (add new + update existing) in one write.
  const importLocal = (rows) => {
    const list = readLocalArray();
    const bySku = new Map(list.map((r) => [r.sku, r]));
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const isBase = baseSkus.has(r.sku);
      if (bySku.has(r.sku) || isBase) updated++;
      else added++;
      bySku.set(r.sku, {
        ...(bySku.get(r.sku) || {}),
        sku: r.sku,
        description: r.description,
        category: r.category,
        technology: r.technology ?? (bySku.get(r.sku)?.technology ?? ''),
        cost: Number(r.cost),
        price: Number(r.price),
        vendor: r.vendor ?? (bySku.get(r.sku)?.vendor ?? ''),
        preferred_vendor: r.preferred_vendor ?? (bySku.get(r.sku)?.preferred_vendor ?? ''),
        product_line: r.product_line ?? (bySku.get(r.sku)?.product_line ?? ''),
        is_custom: !isBase,
        is_deleted: false,
      });
    }
    writeLocal([...bySku.values()]);
    return { added, updated };
  };

  // Bulk upsert used by (1) discount-% change recompute and (2) vendor price
  // import — both already have full row data (sourced from allProducts), so
  // this is a straight write-through, no add/update counting needed.
  const bulkUpdateLocal = (rows) => {
    const list = readLocalArray();
    const bySku = new Map(list.map((r) => [r.sku, r]));
    for (const r of rows) {
      const isBase = baseSkus.has(r.sku);
      bySku.set(r.sku, {
        ...(bySku.get(r.sku) || {}),
        sku: r.sku,
        description: r.description,
        category: r.category,
        technology: r.technology ?? '',
        cost: Number(r.cost),
        price: Number(r.price),
        vendor: r.vendor ?? '',
        preferred_vendor: r.preferred_vendor ?? '',
        product_line: r.product_line ?? '',
        is_custom: !isBase,
        is_deleted: false,
      });
    }
    writeLocal([...bySku.values()]);
    return { updated: rows.length, errors: [] };
  };

  const importProducts = async (rows) => {
    if (!supabase) return importLocal(rows);
    // Configured backend: upsert each row through the privileged route handler.
    // product_line is omitted unless the CSV supplied one, so a general
    // catalog re-import never blanks out product lines assigned via the
    // vendor price importer.
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      await callApi('PATCH', {
        sku: r.sku,
        description: r.description,
        category: r.category,
        cost: Number(r.cost),
        price: Number(r.price),
        ...(r.vendor !== undefined ? { vendor: r.vendor } : {}),
        ...(r.preferred_vendor !== undefined ? { preferred_vendor: r.preferred_vendor } : {}),
        ...(r.product_line ? { product_line: r.product_line } : {}),
        ...(r.technology ? { technology: r.technology } : {}),
      });
      if (baseSkus.has(r.sku)) updated++;
      else added++;
    }
    return { added, updated };
  };

  // Full-row upsert used by (1) discount-% change recompute and (2) vendor
  // price import. Always sends complete rows sourced from allProducts, so no
  // add/update counting is needed — just report how many were written.
  const bulkUpdateProducts = async (rows) => {
    if (!supabase) return bulkUpdateLocal(rows);
    if (!session) throw new Error('Not authenticated');
    const res = await fetch('/api/products/bulk', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rows }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    await refresh();
    return payload;
  };

  return {
    allProducts: mergeProducts(customRows),
    refresh,
    addProduct: async (p) => (supabase ? callApi('POST', p) : addLocal(p)),
    editProduct: async (p) => (supabase ? callApi('PATCH', p) : editLocal(p)),
    deleteProduct: async (sku) => (supabase ? callApi('DELETE', { sku }) : deleteLocal(sku)),
    importProducts,
    bulkUpdateProducts,
  };
}
