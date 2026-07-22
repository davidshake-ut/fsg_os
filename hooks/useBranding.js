'use client';

import { useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { DEFAULT_BRANDING } from '@/lib/defaults';

// Branding source depends on mode:
//   - team mode (Supabase configured): the signed-in user's team (companies row)
//   - local mode: a localStorage store (below), exposed via useSyncExternalStore
//     (hydration-safe: server snapshot is the default brand).
const KEY = 'wifibuilder.branding';
const listeners = new Set();
let cache = null;
let cacheRaw = null;

function getSnapshot() {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
  if (raw === cacheRaw && cache) return cache;
  cacheRaw = raw;
  try {
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? { ...DEFAULT_BRANDING, ...parsed } : DEFAULT_BRANDING;
  } catch {
    cache = DEFAULT_BRANDING;
  }
  return cache;
}

function getServerSnapshot() {
  return DEFAULT_BRANDING;
}

function subscribe(callback) {
  listeners.add(callback);
  const onStorage = (e) => {
    if (e.key === KEY || e.key === null) callback();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

function setLocalBranding(next) {
  if (typeof window === 'undefined') return;
  const merged = { ...DEFAULT_BRANDING, ...next };
  const raw = JSON.stringify(merged);
  window.localStorage.setItem(KEY, raw);
  cache = merged;
  cacheRaw = raw;
  listeners.forEach((cb) => cb());
}

function companyBranding(company) {
  if (!company) return DEFAULT_BRANDING;
  return {
    companyName: company.name || '',
    logo: company.logo || null,
    logoLight: company.logo_light || null,
    favicon: company.favicon || null,
    primaryColor: company.primary_color || DEFAULT_BRANDING.primaryColor,
    accentColor: company.accent_color || DEFAULT_BRANDING.accentColor,
    secondaryColor: company.secondary_color || DEFAULT_BRANDING.secondaryColor,
    backgroundColor: company.background_color || DEFAULT_BRANDING.backgroundColor,
    uiTheme: company.ui_theme || DEFAULT_BRANDING.uiTheme,
    sidebarStyle: company.sidebar_style || DEFAULT_BRANDING.sidebarStyle,
    accentStyle: company.accent_style || DEFAULT_BRANDING.accentStyle,
  };
}

// opts: { configured, company, onSaved } in team mode; no args in local mode.
export function useBranding(opts = {}) {
  const { configured = false, company = null, onSaved } = opts;
  // Always call the hook (Rules of Hooks); only used in local mode.
  const localBranding = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (configured) {
    const branding = companyBranding(company);
    const setBranding = async (b) => {
      const supabase = getSupabase();
      if (!company?.id) throw new Error('Branding is per team — join or select a team first.');
      if (!supabase) return;
      const { error } = await supabase
        .from('companies')
        .update({
          name: b.companyName || company.name,
          logo: b.logo ?? null,
          logo_light: b.logoLight ?? null,
          favicon: b.favicon ?? null,
          primary_color: b.primaryColor,
          accent_color: b.accentColor,
          secondary_color: b.secondaryColor,
          background_color: b.backgroundColor,
          ui_theme: b.uiTheme,
          sidebar_style: b.sidebarStyle,
          accent_style: b.accentStyle ?? 'gradient',
        })
        .eq('id', company.id);
      if (error) throw error;
      if (onSaved) await onSaved();
    };
    return { branding, setBranding };
  }

  return { branding: localBranding, setBranding: setLocalBranding };
}
