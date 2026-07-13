'use client';

// Brand-gradient progress bar (theme-aware: picks up the team's colors via
// BrandingVars). Arbitrary [background:...] because bg-[...] emits
// background-color and silently drops gradients.
export default function ProjectProgressBar({ pct = 0, className = '' }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className="h-full rounded-full [background:linear-gradient(90deg,var(--brand,#4f46e5),var(--brand-secondary,#06b6d4))] transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
