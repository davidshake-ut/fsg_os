// Builder defaults resolution: per-user preference overrides team setting,
// team setting overrides the hardcoded defaults. localStorage is only the
// fallback for local mode (no Supabase configured).
export const BUILDER_DEFAULTS_KEY = 'fsg_builder_defaults';

export const FALLBACK_BUILDER_DEFAULTS = {
  includeWifi: true,
  includeCameras: true,
  includeShipping: true,
  shippingPercent: 7,
};

export function readLocalBuilderDefaults() {
  try {
    return JSON.parse(localStorage.getItem(BUILDER_DEFAULTS_KEY) || 'null');
  } catch {
    return null;
  }
}

export function resolveBuilderDefaults({ user, company, configured }) {
  const local = configured ? null : readLocalBuilderDefaults();
  return {
    ...FALLBACK_BUILDER_DEFAULTS,
    ...(company?.settings?.builderDefaults ?? {}),
    ...(user?.preferences?.builderDefaults ?? {}),
    ...(local ?? {}),
  };
}
