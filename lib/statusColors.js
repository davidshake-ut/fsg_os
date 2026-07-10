import { cn } from '@/lib/utils';

// Single source of truth for status/priority color values across the app.
// Every domain-specific badge (project status, quote status, ticket
// priority, CRM stage, etc.) maps its own statuses to one of these six
// semantic tones rather than inventing bg-{color}-50/text-{color}-700
// pairs per file — the tone names are what's meaningful ("this is a
// success state"), the actual hex/utility values live here once.
//
// Values reference CSS custom properties (app/globals.css's --tone-* vars)
// rather than literal Tailwind color classes, so every badge in the app
// automatically re-skins between the pastel "muted" look and the solid
// saturated "bold" look driven by the [data-ui-theme] attribute (a team
// setting — see components/BrandingVars.jsx) — zero per-component changes
// needed.
export const TONES = {
  neutral:  { bg: 'bg-[var(--tone-neutral-bg)]',  text: 'text-[var(--tone-neutral-text)]',  border: 'border-[var(--tone-neutral-border)]',  dot: 'bg-[var(--tone-neutral-dot)]'  },
  info:     { bg: 'bg-[var(--tone-info-bg)]',     text: 'text-[var(--tone-info-text)]',     border: 'border-[var(--tone-info-border)]',     dot: 'bg-[var(--tone-info-dot)]'     },
  progress: { bg: 'bg-[var(--tone-progress-bg)]', text: 'text-[var(--tone-progress-text)]', border: 'border-[var(--tone-progress-border)]', dot: 'bg-[var(--tone-progress-dot)]' },
  warning:  { bg: 'bg-[var(--tone-warning-bg)]',  text: 'text-[var(--tone-warning-text)]',  border: 'border-[var(--tone-warning-border)]',  dot: 'bg-[var(--tone-warning-dot)]'  },
  danger:   { bg: 'bg-[var(--tone-danger-bg)]',   text: 'text-[var(--tone-danger-text)]',   border: 'border-[var(--tone-danger-border)]',   dot: 'bg-[var(--tone-danger-dot)]'   },
  success:  { bg: 'bg-[var(--tone-success-bg)]',  text: 'text-[var(--tone-success-text)]',  border: 'border-[var(--tone-success-border)]',  dot: 'bg-[var(--tone-success-dot)]'  },
  // 7th tone for severity ramps that need a step between warning and danger
  // (e.g. ticket priority: low/medium/high/critical).
  orange:   { bg: 'bg-[var(--tone-orange-bg)]',   text: 'text-[var(--tone-orange-text)]',   border: 'border-[var(--tone-orange-border)]',   dot: 'bg-[var(--tone-orange-dot)]'   },
};

// className string for a tone — for call sites that build their own badge
// markup instead of using components/ui/primitives.jsx's <StatusBadge>.
export function toneClasses(tone, { border = true } = {}) {
  const t = TONES[tone] ?? TONES.neutral;
  return cn(t.bg, t.text, border && t.border);
}

// Larger surfaces (KPI chips, avatars) — a two-hue gradient per tone in
// "bold" mode (app/globals.css's --tile-* vars), flat in "muted" mode.
// Uses the `background` shorthand (not `bg-`/background-color) since bold
// values are gradients — background-color silently drops those.
const TILE_BG = {
  neutral:  '[background:var(--tile-neutral-bg)]',
  info:     '[background:var(--tile-info-bg)]',
  progress: '[background:var(--tile-progress-bg)]',
  warning:  '[background:var(--tile-warning-bg)]',
  danger:   '[background:var(--tile-danger-bg)]',
  success:  '[background:var(--tile-success-bg)]',
  orange:   '[background:var(--tile-orange-bg)]',
};

export function tileClasses(tone) {
  const t = TONES[tone] ?? TONES.neutral;
  return cn(TILE_BG[tone] ?? TILE_BG.neutral, t.text);
}
