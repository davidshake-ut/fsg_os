'use client';

import { useEffect } from 'react';
import { useSession } from '@/components/SessionProvider';
import { useBranding } from '@/hooks/useBranding';
import { readableTextHex } from '@/lib/colors';
import { isSupabaseConfigured } from '@/lib/supabase/client';

// Applies the signed-in team's branding (hooks/useBranding.js) as CSS custom
// properties on <html>, plus the "Muted"/"Bold" appearance mode and
// "Gradient"/"Solid" sidebar style as data attributes (app/globals.css reads
// all of these) — the single place that hoists per-team branding from a
// settings form to the whole app's chrome. Renders nothing; mount once near
// the root (app/layout.js).
export default function BrandingVars() {
  const { company } = useSession();
  const { branding } = useBranding({ configured: isSupabaseConfigured, company });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand', branding.primaryColor);
    root.style.setProperty('--brand-secondary', branding.secondaryColor);
    root.style.setProperty('--brand-text', readableTextHex(branding.primaryColor));
    if (branding.backgroundColor) root.style.setProperty('--ui-page-bg', branding.backgroundColor);
    else root.style.removeProperty('--ui-page-bg');
    root.setAttribute('data-ui-theme', branding.uiTheme === 'muted' ? 'muted' : 'bold');
    root.setAttribute('data-sidebar-style', branding.sidebarStyle === 'solid' ? 'solid' : 'gradient');
    root.setAttribute('data-accent-style', branding.accentStyle === 'solid' ? 'solid' : 'gradient');
  }, [branding.primaryColor, branding.secondaryColor, branding.backgroundColor, branding.uiTheme, branding.sidebarStyle, branding.accentStyle]);

  // Browser-tab favicon follows the team too; fall back to the stock icon.
  const faviconUrl = branding.favicon?.dataUrl ?? null;
  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl ?? '/favicon.ico';
  }, [faviconUrl]);

  return null;
}
