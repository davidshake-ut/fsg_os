'use client';

import { initials } from '@/lib/utils';

// Overlapping initials avatars, ClickUp/Asana style. Each person gets a
// stable vivid gradient derived from their id so the same face reads the
// same color everywhere.
const GRADIENTS = [
  'linear-gradient(135deg,#4f46e5,#818cf8)',
  'linear-gradient(135deg,#06b6d4,#22d3ee)',
  'linear-gradient(135deg,#f43f5e,#fb7185)',
  'linear-gradient(135deg,#10b981,#34d399)',
  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'linear-gradient(135deg,#8b5cf6,#a78bfa)',
];

const gradientFor = (id) => {
  let h = 0;
  for (let i = 0; i < (id ?? '').length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

export default function AvatarStack({ members = [], max = 4, size = 22, className = '' }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, max);
  const extra = members.length - visible.length;
  const dim = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return (
    <div className={`flex items-center ${className}`}>
      {visible.map((m, i) => (
        <span
          key={m.id}
          title={m.name}
          style={{ ...dim, background: gradientFor(m.id), marginLeft: i === 0 ? 0 : -Math.round(size * 0.3) }}
          className="flex shrink-0 items-center justify-center rounded-full border-2 border-white font-bold uppercase text-white shadow-sm"
        >
          {initials(m.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{ ...dim, marginLeft: -Math.round(size * 0.3) }}
          className="flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-200 font-bold text-slate-500 shadow-sm"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
