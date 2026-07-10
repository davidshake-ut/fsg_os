'use client';

import { cn } from '@/lib/utils';
import { TONES } from '@/lib/statusColors';

// Elevation/radius convention (enterprise data-dense direction — flat and
// hairline-driven, not skeuomorphic):
//   - In-page surfaces (Card, inputs, dropdowns): border + shadow-sm at most.
//   - True overlays (modals, popovers, command palette): shadow-xl/2xl is
//     fine — they're leaving the page, real elevation communicates that.
//   - Radius: rounded-lg for controls/inputs, rounded-xl for cards/panels,
//     rounded-full for pills/badges/avatars. Don't reach for rounded-2xl+
//     outside modals.

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]',
        className
      )}
      {...props}
    />
  );
}

export function Button({ className, variant = 'default', size = 'md', ...props }) {
  const variants = {
    // --ui-button-bg is a solid color in "muted" mode but a gradient in
    // "bold" mode (app/globals.css) — bg-[...] would emit background-color,
    // which silently drops gradient values (invalid CSS), rendering an
    // unstyled/invisible button. The [background:...] arbitrary property
    // emits the `background` shorthand instead, which accepts either.
    default:
      '[background:var(--ui-button-bg,var(--brand,#2563eb))] text-[var(--brand-text,#fff)] shadow-sm hover:brightness-110 disabled:bg-slate-200 disabled:bg-none disabled:text-slate-400 disabled:shadow-none disabled:brightness-100',
    outline:
      'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  };
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-3.5 text-sm',
    lg: 'h-10 px-5 text-sm',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        className
      )}
      {...props}
    />
  );
}

// Domain-agnostic status/priority pill — pass a semantic `tone` (see
// lib/statusColors.js) rather than colors. Domain badges (ProjectStatusBadge,
// QuoteStatusBadge, TicketPriorityBadge, etc.) wrap this with their own
// status -> tone mapping so the color values live in exactly one place.
export function StatusBadge({ tone = 'neutral', dot = false, className, children }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', t.bg, t.text, t.border, className)}>
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}

export function Label({ className, ...props }) {
  return (
    <label className={cn('block text-xs font-medium text-slate-600', className)} {...props} />
  );
}

const inputBase =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm shadow-slate-900/[0.02] outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400';

export function TextInput({ className, ...props }) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function NumberInput({ className, value, onChange, min = 0, ...props }) {
  return (
    <input
      type="number"
      min={min}
      className={cn(inputBase, className)}
      value={value ?? 0}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? 0 : Number(v));
      }}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(inputBase, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, sub, children, className }) {
  return (
    <div className={cn('space-y-1', className)}>
      {label && <Label>{label}</Label>}
      {children}
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 text-sm text-slate-700"
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  );
}

// ── Table primitives (Tier 4 wires these into the list pages — this Tier
//    just establishes the shared shape) ──────────────────────────────────
export function Table({ className, minWidth = 560, children }) {
  return (
    <div className={cn('overflow-x-auto overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-900/[0.03]', className)}>
      <table className="w-full" style={{ minWidth }}>{children}</table>
    </div>
  );
}

export function THead({ columns }) {
  return (
    <thead>
      <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
        {columns.map((h) => (
          <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">{h}</th>
        ))}
      </tr>
    </thead>
  );
}

export function TRow({ className, onClick, children }) {
  return (
    <tr
      onClick={onClick}
      className={cn('border-b border-slate-100 transition-colors last:border-0', onClick && 'cursor-pointer hover:bg-slate-50', className)}
    >
      {children}
    </tr>
  );
}

export function TCell({ className, numeric = false, children }) {
  return (
    <td className={cn('px-4 py-3 text-sm text-slate-600', numeric && 'text-right font-mono tabular-nums', className)}>
      {children}
    </td>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <Card className={cn('py-16 text-center', className)}>
      {Icon && <Icon size={32} className="mx-auto mb-3 text-slate-300" />}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
            value === opt.value
              ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-900/5'
              : 'text-slate-500 hover:text-slate-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
