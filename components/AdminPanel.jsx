'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, UserPlus, Building2, Puzzle, Palette, Users, Upload, X, DollarSign, Pencil, Send, Wrench } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { useBranding } from '@/hooks/useBranding';
import { useProducts } from '@/hooks/useProducts';
import { Card, Button, Field, TextInput, Select, Badge, Segmented } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ModulesPanel from '@/components/ModulesPanel';
import CustomModulesPanel from '@/components/CustomModulesPanel';
import PricingPolicyForm from '@/components/PricingPolicyForm';
import LaborTasksForm from '@/components/LaborTasksForm';
import RecurringSettingsForm from '@/components/RecurringSettingsForm';
import { costFromDiscount, DEFAULT_PRODUCT_LINE_DISCOUNTS } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { fmtDate as fmtDateShared } from '@/lib/format';

// ── Tab definitions ────────────────────────────────────────────────────────

const SA_TABS = [
  { key: 'teams',    label: 'Teams',           Icon: Building2          },
  { key: 'modules',  label: 'Module Settings', Icon: Puzzle             },
  { key: 'branding', label: 'Team Branding',   Icon: Palette            },
  { key: 'pricing',  label: 'Pricing',         Icon: DollarSign         },
  { key: 'labor',    label: 'Labor',           Icon: Wrench             },
  { key: 'members',  label: 'Members',         Icon: Users              },
];

// Module visibility is platform-level policy: only the super admin manages
// it (SA_TABS 'modules'); team admins don't get the tab (David, 2026-07-13).
// The old Builder-defaults tab is gone too — technology toggles and the
// shipping estimate live on the Builder's Overview page per quote now.
const CA_TABS = [
  { key: 'branding', label: 'Branding', Icon: Palette           },
  { key: 'pricing',  label: 'Pricing',  Icon: DollarSign        },
  { key: 'labor',    label: 'Labor',    Icon: Wrench            },
  { key: 'members',  label: 'Members',  Icon: Users             },
];

// Non-admin members have nothing to configure here (see empty state below).
const USER_TABS = [];

// ── Branding form (shared by super admin + company admin) ─────────────────

function BrandingForm({ initial, onSave }) {
  const [form, setForm]     = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState(null);
  const fileRef             = useRef();
  const fileLightRef        = useRef();
  const favRef              = useRef();

  useEffect(() => { setForm(initial); }, [JSON.stringify(initial)]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // key: 'logo' (dark artwork, light backgrounds) or 'logoLight' (light
  // artwork, dark backgrounds) — consumers pick per surface via pickLogo().
  const handleLogoFile = (file, key = 'logo') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => set(key, { dataUrl: ev.target.result, w: img.naturalWidth, h: img.naturalHeight });
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Favicons ride in the companies row like the logo — keep them tiny.
  const handleFaviconFile = (file) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setErr('Favicon should be under 256 KB — use a small square PNG (32–64px).');
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = (ev) => set('favicon', { dataUrl: ev.target.result });
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) handleLogoFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <Field label="Team / Company Name">
        <TextInput value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
      </Field>

      {/* Logos — dark artwork for light surfaces, light artwork for dark
          surfaces (banners, sidebar gradients). The app picks per surface. */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Logo — Dark version</p>
        <p className="mb-2 text-[11px] text-slate-400">Used on light backgrounds (white pages, printed invoices, light banners).</p>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex items-center gap-4"
        >
          {form.logo?.dataUrl ? (
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5">
              <img src={form.logo.dataUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
              <button
                type="button"
                onClick={() => set('logo', null)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-white hover:bg-red-500"
              >
                <X size={9} />
              </button>
            </div>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300">
              <Upload size={20} />
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {form.logo ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">PNG, SVG, JPG — drag & drop or click</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoFile(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Logo — Light version</p>
        <p className="mb-2 text-[11px] text-slate-400">Used on dark backgrounds (proposal and invoice PDF banners, dark sidebars). Usually white or knockout artwork.</p>
        <div className="flex items-center gap-4">
          {form.logoLight?.dataUrl ? (
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 p-1.5">
              <img src={form.logoLight.dataUrl} alt="Light logo" className="max-h-full max-w-full object-contain" />
              <button
                type="button"
                onClick={() => set('logoLight', null)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-white hover:bg-red-500"
              >
                <X size={9} />
              </button>
            </div>
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-800/90 text-slate-500">
              <Upload size={20} />
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileLightRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {form.logoLight ? 'Replace light logo' : 'Upload light logo'}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">Optional — the dark version is used everywhere if this is empty</p>
            <input
              ref={fileLightRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoFile(e.target.files?.[0], 'logoLight')}
            />
          </div>
        </div>
      </div>

      {/* Favicon */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Favicon</p>
        <div className="flex items-center gap-4">
          {form.favicon?.dataUrl ? (
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1">
              <img src={form.favicon.dataUrl} alt="Favicon" className="max-h-full max-w-full object-contain" />
              <button
                type="button"
                onClick={() => set('favicon', null)}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-white hover:bg-red-500"
              >
                <X size={9} />
              </button>
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300">
              <Upload size={14} />
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => favRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {form.favicon ? 'Replace favicon' : 'Upload favicon'}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">Square PNG or ICO, 32–64px — shows in the browser tab</p>
            <input
              ref={favRef}
              type="file"
              accept="image/*,.ico"
              className="hidden"
              onChange={(e) => handleFaviconFile(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <p className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Brand Colors</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Primary color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
                className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-blue-400"
                placeholder="#2563eb"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Secondary color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.secondaryColor}
                onChange={(e) => set('secondaryColor', e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={form.secondaryColor}
                onChange={(e) => set('secondaryColor', e.target.value)}
                className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-blue-400"
                placeholder="#0891b2"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Accent color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={form.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-blue-400"
                placeholder="#1e40af"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs text-slate-500">Background color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.backgroundColor || '#f6f7f9'}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={form.backgroundColor || ''}
                onChange={(e) => set('backgroundColor', e.target.value)}
                className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm outline-none focus:border-blue-400"
                placeholder="#f6f7f9"
              />
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <span className="text-xs text-slate-400">Preview:</span>
          <span
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: form.primaryColor }}
          >
            Primary
          </span>
          <span
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: form.secondaryColor }}
          >
            Secondary
          </span>
          <span
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: form.accentColor }}
          >
            Accent
          </span>
          <span
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: `linear-gradient(120deg, ${form.primaryColor}, ${form.secondaryColor})` }}
          >
            Gradient
          </span>
          {(form.logo?.dataUrl || form.logoLight?.dataUrl) && (
            <span className="ml-auto flex items-center gap-2">
              {form.logo?.dataUrl && <img src={form.logo.dataUrl} alt="Company logo" className="h-7 w-auto object-contain" />}
              {form.logoLight?.dataUrl && (
                <span className="rounded-lg bg-slate-800 px-2 py-1">
                  <img src={form.logoLight.dataUrl} alt="Light logo" className="h-6 w-auto object-contain" />
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Appearance */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Appearance</p>
        <p className="mb-2.5 text-xs text-slate-400">
          Applies to everyone on this team. Bold uses Primary/Secondary as a gradient across the
          sidebar and buttons; Muted keeps a flat, restrained look with Primary as a single accent.
        </p>
        <div className="max-w-xs">
          <Segmented
            value={form.uiTheme}
            onChange={(v) => set('uiTheme', v)}
            options={[
              { value: 'bold', label: 'Bold' },
              { value: 'muted', label: 'Muted' },
            ]}
          />
        </div>

        {form.uiTheme === 'bold' && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Sidebar style</p>
              <Segmented
                value={form.sidebarStyle}
                onChange={(v) => set('sidebarStyle', v)}
                options={[
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'solid', label: 'Solid' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Buttons &amp; accents</p>
              <Segmented
                value={form.accentStyle ?? 'gradient'}
                onChange={(v) => set('accentStyle', v)}
                options={[
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'solid', label: 'Solid' },
                ]}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Branding'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved!</span>}
      </div>
    </form>
  );
}

// ── Members table ─────────────────────────────────────────────────────────

// Slide-down profile editor for one member: name, title, notes.
function MemberProfileEditor({ member, onSave, onCancel }) {
  const [form, setForm] = useState({
    full_name: member.full_name ?? '',
    title: member.title ?? '',
    notes: member.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        full_name: form.full_name.trim() || null,
        title: form.title.trim() || null,
        notes: form.notes.trim() || null,
      });
      onCancel();
    } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="my-1 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <TextInput autoFocus value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Title">
          <TextInput value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Field Technician" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
            placeholder="Certifications, territories, schedule notes…"
            className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Member'}</Button>
      </div>
    </form>
  );
}

// Compact relative timestamp for the members activity column.
function lastSeenLabel(iso) {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateShared(iso);
}

function MembersTable({ members, companies, selfId, visitCounts = {}, onRole, onRemove, onResend, onReassign, onSaveProfile, superAdmin, guestAccounts = [] }) {
  const [editingId, setEditingId] = useState(null);
  const cols = superAdmin ? 6 : 5;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Email</th>
            {superAdmin && <th className="py-2 pr-2">Team</th>}
            <th className="py-2 pr-2">Role</th>
            <th className="py-2 pr-2">Activity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isSelf  = m.id === selfId;
            const isSuper = m.role === 'super_admin';
            return (
              <Fragment key={m.id}>
              <tr className="border-b border-slate-50">
                <td className="py-2 pr-2 text-slate-700">
                  <span className="font-medium">{m.full_name || '—'}</span>
                  {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                  {m.title && <span className="block text-xs text-slate-400">{m.title}</span>}
                  {m.notes && <span className="block max-w-[280px] truncate text-xs italic text-slate-300" title={m.notes}>{m.notes}</span>}
                </td>
                <td className="py-2 pr-2 text-slate-500">{m.email}</td>
                {superAdmin && (
                  <td className="py-2 pr-2">
                    <Select
                      className="h-8 w-44"
                      value={m.company_id || ''}
                      onChange={(e) => onReassign(m.id, e.target.value)}
                    >
                      <option value="">— none —</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </td>
                )}
                <td className="py-2 pr-2">
                  {isSuper ? (
                    <Badge className="border-violet-200 bg-violet-50 text-violet-600">Super Admin</Badge>
                  ) : (
                    <>
                      <Select
                        className="h-8 w-32"
                        value={m.role}
                        onChange={(e) => onRole(m.id, e.target.value, m.guest_account_id ?? null)}
                      >
                        <option value="user">User</option>
                        <option value="company_admin">Admin</option>
                        <option value="viewer">View Only</option>
                        <option value="guest">Guest</option>
                      </Select>
                      {m.role === 'guest' && (
                        <Select
                          className="mt-1 h-8 w-40 text-xs"
                          value={m.guest_account_id ?? ''}
                          title="Which customer account this guest can see — they see ONLY that account's proposals, projects, invoices, and support cases"
                          onChange={(e) => onRole(m.id, 'guest', e.target.value || null)}
                        >
                          <option value="">— no account (sees nothing) —</option>
                          {(guestAccounts ?? [])
                            .filter((a) => a.company_id === m.company_id)
                            .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                      )}
                    </>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <span className="font-medium tabular-nums text-slate-700">{visitCounts[m.id] || 0}</span>
                  <span className="text-xs text-slate-400"> visits</span>
                  <span className="block text-xs text-slate-400">
                    {m.last_seen_at ? `last ${lastSeenLabel(m.last_seen_at)}` : 'no visits recorded'}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                      title="Edit member profile"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil size={14} />
                    </button>
                    {!isSelf && !isSuper && (
                      <>
                        <button
                          onClick={() => onResend(m)}
                          title="Resend invite / send set-password link"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          onClick={() => onRemove(m)}
                          title="Remove from team"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {editingId === m.id && (
                <tr className="border-b border-slate-50">
                  <td colSpan={cols} className="pb-2">
                    <MemberProfileEditor
                      member={m}
                      onSave={(patch) => onSaveProfile(m.id, patch)}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {members.length === 0 && (
            <tr>
              <td colSpan={cols} className="py-6 text-center text-sm text-slate-400">
                No members yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Pricing / product-line discounts ───────────────────────────────────────

// Cost is derived, never entered directly: cost = price × (1 − discount%) for
// any catalog product tagged with a matching Product Line. Editing a discount
// here recomputes cost immediately across the catalog — but locked quotes
// (sent/accepted/declined) read from their own frozen catalog_snapshot, so
// this never silently reprices a quote that's already gone to a customer.
function PricingDiscountsForm() {
  const supabase = getSupabase();
  const { session, company, refresh: refreshSession } = useSession();
  const { allProducts, bulkUpdateProducts } = useProducts(session, { teamFilter: company?.id ?? 'all' });

  const initialRows = () => {
    const stored = company?.settings?.productLineDiscounts;
    const map = stored && Object.keys(stored).length ? stored : DEFAULT_PRODUCT_LINE_DISCOUNTS;
    return Object.entries(map).map(([line, pct]) => ({ id: `${line}-${Math.random().toString(36).slice(2)}`, line, pct }));
  };

  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const [recomputedCount, setRecomputedCount] = useState(null);

  useEffect(() => {
    setRows(initialRows());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, JSON.stringify(company?.settings?.productLineDiscounts)]);

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, { id: `new-${Date.now()}`, line: '', pct: 0 }]);

  const save = async () => {
    if (!supabase || !company) return;
    setSaving(true);
    setErr(null);
    setRecomputedCount(null);
    try {
      const discountMap = Object.fromEntries(
        rows
          .map((r) => [r.line.trim(), Number(r.pct) || 0])
          .filter(([line]) => line)
      );

      const settings = { ...(company.settings ?? {}), productLineDiscounts: discountMap };
      const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
      if (error) throw error;

      // Recompute cost for every catalog product tagged with a line that's in
      // the new table — only rows whose cost actually changes are written.
      const changed = [];
      for (const p of allProducts) {
        if (!p.product_line || !(p.product_line in discountMap)) continue;
        const newCost = costFromDiscount(p.price, discountMap[p.product_line]);
        if (newCost !== p.cost) {
          changed.push({
            sku: p.baseSku ?? p.sku, // identity — never the display alias
            description: p.desc,
            category: p.category,
            technology: p.technology,
            cost: newCost,
            price: p.price,
            vendor: p.vendor,
            preferred_vendor: p.preferred_vendor,
            product_line: p.product_line,
          });
        }
      }
      if (changed.length) await bulkUpdateProducts(changed);
      setRecomputedCount(changed.length);

      await refreshSession?.().catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  if (!company) {
    return <p className="text-sm text-slate-400">Join a team to manage pricing.</p>;
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Product Line Discounts</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Cost = Price × (1 − Discount) for any catalog product tagged with a matching Product Line
          (set per-product in the Product Database). Changing a discount recomputes Cost immediately
          — quotes already Sent/Accepted/Declined keep their original cost and are never affected.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-400">
              <th className="px-3 py-2 font-medium">Product Line</th>
              <th className="px-3 py-2 text-right font-medium">Discount %</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-1.5">
                  <input
                    value={r.line}
                    onChange={(e) => setRow(r.id, { line: e.target.value })}
                    placeholder="e.g. cnWave"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number" min="0" max="100" step="1"
                    value={r.pct}
                    onChange={(e) => setRow(r.id, { pct: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-blue-400"
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove ${r.line || 'product line'}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                  No product lines yet — add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} className="text-xs font-medium text-blue-600 hover:text-blue-700">
        + Add Product Line
      </button>

      <div className="flex items-center gap-3 pt-1">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save & Recompute Cost'}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600">
            Saved!{recomputedCount ? ` Recomputed cost for ${recomputedCount} product(s).` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-slate-100 pb-0">
      {tabs.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
            active === key
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          )}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main AdminPanel ───────────────────────────────────────────────────────

export default function AdminPanel() {
  const supabase = getSupabase();
  const { session, isSuperAdmin, isAdmin, company, user, role, refresh: refreshSession } = useSession();

  const tabs = isSuperAdmin ? SA_TABS : isAdmin ? CA_TABS : USER_TABS;
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? null);

  const [companies, setCompanies] = useState([]);
  const [members,   setMembers]   = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const [invite,  setInvite]  = useState({ email: '', role: 'user', companyId: '' });
  const [newTeam, setNewTeam] = useState({ name: '', adminEmail: '' });
  const [activityPeriod, setActivityPeriod] = useState('7d');
  const [visitCounts, setVisitCounts] = useState({});
  // CRM accounts for the guest-role scoping dropdown (0066). RLS scopes:
  // team admins get their team's accounts, super admins get every team's.
  const [guestAccounts, setGuestAccounts] = useState([]);
  useEffect(() => {
    if (!supabase || !session) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('crm_accounts').select('id, name, company_id').order('name');
      if (!cancelled) setGuestAccounts(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [supabase, session]);

  const [confirmState, setConfirmState] = useState(null);

  // Super admin team branding state
  const [brandingTargetId, setBrandingTargetId] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [c, u] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('users').select('*').order('email'),
    ]);
    setCompanies(c.data || []);
    setMembers(u.data || []);
  }, [supabase]);

  useEffect(() => { void refresh(); }, [refresh]);

  const flash = (type, text) => {
    if (type === 'err') { setErr(text); setMsg(null); }
    else { setMsg(text); setErr(null); }
    setTimeout(() => { setErr(null); setMsg(null); }, 4000);
  };

  const api = async (url, method, body) => {
    setErr(null); setMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { flash('err', data.error || 'Request failed'); return false; }
      await refresh();
      // Truthy for boolean call sites; carries the payload for those that care.
      return data && typeof data === 'object' ? data : true;
    } catch {
      flash('err', 'Network error — check your connection and try again.');
      return false;
    }
  };

  const inviteFlash = (out, email) =>
    flash('ok', out.mode === 'recovery_sent'
      ? `${email} already has an account — sent them a link to set their password.`
      : out.mode === 'reattached'
        ? `${email} re-added to the team${out.recoverySent ? ' and sent a link to set their password' : ' — their existing login still works'}.`
        : out.mode === 'reinvited'
          ? `Fresh invitation sent to ${email} (their old invite was cleared).`
          : `Invitation sent to ${email}.`);

  const sendInvite = async (e, body) => {
    e.preventDefault();
    const out = await api('/api/invite', 'POST', body);
    if (out) {
      inviteFlash(out, body.email);
      setInvite({ email: '', role: 'user', companyId: '' });
    }
  };

  // Per-row "Resend invite": pending members get a fresh invite email;
  // members who already accepted get a set-password link instead.
  const resendInvite = async (m) => {
    const companyId = m.company_id || null;
    if (!companyId && isSuperAdmin) {
      flash('err', 'Assign this member to a team first (Team column), then resend.');
      return;
    }
    const out = await api('/api/invite', 'POST', { email: m.email, role: m.role, companyId, resend: true });
    if (out) inviteFlash(out, m.email);
  };

  const setRole      = (userId, role, guestAccountId = null) =>
    api('/api/members', 'PATCH', { userId, role, guestAccountId });

  // Visit counts for the Members activity column (access_log, 0051). RLS
  // scopes the rows: team admins see their team, super admins see all.
  const loadVisits = useCallback(async () => {
    if (!supabase) return;
    const days = activityPeriod === '24h' ? 1 : activityPeriod === '30d' ? 30 : 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabase
      .from('access_log')
      .select('user_id')
      .gte('seen_at', since)
      .limit(20000);
    const counts = {};
    (data || []).forEach((r) => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
    setVisitCounts(counts);
  }, [supabase, activityPeriod]);
  useEffect(() => { void loadVisits(); }, [loadVisits]);

  // Profile fields (name/title/notes) go straight through RLS — the
  // users_update policy already scopes company_admins to their own team.
  const saveProfile = async (userId, patch) => {
    const { error } = await supabase.from('users').update(patch).eq('id', userId);
    if (error) return flash('err', error.message);
    flash('ok', 'Member updated.');
    await refresh();
    // Editing your own row: the sidebar/name chip reads the cached session.
    if (userId === user?.id) await refreshSession?.().catch(() => {});
  };
  const removeMember = (m) => {
    setConfirmState({
      title: 'Remove member',
      message: `Remove ${m.email} from their team? They will lose access immediately.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        const out = await api('/api/members', 'DELETE', { userId: m.id });
        if (out) {
          flash('ok', out.deleted
            ? `${m.email} removed — that address can be invited fresh.`
            : `${m.email} removed from their team. Their account remains; use the resend button (✉) to bring them onto a team again.`);
        }
      },
    });
  };

  const createTeam = async (e) => {
    e.preventDefault(); setErr(null); setMsg(null);
    try {
      const { data, error } = await supabase.from('companies').insert({ name: newTeam.name.trim() }).select().single();
      if (error) return flash('err', error.message);
      if (newTeam.adminEmail.trim()) {
        await api('/api/invite', 'POST', { email: newTeam.adminEmail.trim(), role: 'company_admin', companyId: data.id });
      }
      flash('ok', `Team "${data.name}" created${newTeam.adminEmail ? ' and first Admin invited' : ''}.`);
      setNewTeam({ name: '', adminEmail: '' });
    } catch {
      flash('err', 'Network error — could not create team.');
    }
  };

  const deleteTeam = (c) => {
    setConfirmState({
      title: 'Delete team',
      message: `Delete "${c.name}" and all its data? This cannot be undone.`,
      confirmLabel: 'Delete Team',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('companies').delete().eq('id', c.id);
          if (error) flash('err', error.message);
          else { flash('ok', `Team "${c.name}" deleted.`); await refresh(); }
        } catch {
          flash('err', 'Network error — could not delete team.');
        }
      },
    });
  };

  const reassignTeam = async (userId, companyId) => {
    const { error } = await supabase.from('users').update({ company_id: companyId || null }).eq('id', userId);
    if (error) return flash('err', error.message);
    await refresh();
    if (userId === user?.id) await refreshSession?.().catch(() => {});
  };

  const memberCount = (cid) => members.filter((m) => m.company_id === cid).length;

  // ── Branding for company admin (own team)
  // Saving branding updates the `companies` row, but the app's global
  // `company` object (read everywhere via useSession(), including
  // components/BrandingVars.jsx) is cached in hooks/useTenant.js and only
  // refetched by refreshSession() — this app's own local `refresh()` only
  // re-fetches AdminPanel's own team/member lists. Without also calling
  // refreshSession(), saved appearance/color changes never visibly apply.
  const { branding: ownBranding, setBranding: saveOwnBranding } = useBranding({
    configured: isSupabaseConfigured,
    company,
    onSaved: async () => { await Promise.all([refresh(), refreshSession()]); },
  });

  // ── Branding for super admin targeting a specific team
  const brandingTarget = companies.find((c) => c.id === brandingTargetId) ?? null;
  const brandingInitial = brandingTarget
    ? {
        companyName:    brandingTarget.name            || '',
        logo:           brandingTarget.logo            || null,
        logoLight:      brandingTarget.logo_light      || null,
        favicon:        brandingTarget.favicon         || null,
        primaryColor:   brandingTarget.primary_color    || '#2563eb',
        accentColor:    brandingTarget.accent_color     || '#1e40af',
        secondaryColor: brandingTarget.secondary_color  || '#0891b2',
        uiTheme:        brandingTarget.ui_theme         || 'bold',
        sidebarStyle:   brandingTarget.sidebar_style    || 'gradient',
        accentStyle:    brandingTarget.accent_style     || 'gradient',
      }
    : { companyName: '', logo: null, logoLight: null, favicon: null, primaryColor: '#2563eb', accentColor: '#1e40af', secondaryColor: '#0891b2', uiTheme: 'bold', sidebarStyle: 'gradient', accentStyle: 'gradient' };

  const saveSuperBranding = async (form) => {
    if (!supabase || !brandingTargetId) return;
    const { error } = await supabase
      .from('companies')
      .update({
        name:            form.companyName,
        logo:            form.logo ?? null,
        logo_light:      form.logoLight ?? null,
        favicon:         form.favicon ?? null,
        primary_color:   form.primaryColor,
        accent_color:    form.accentColor,
        secondary_color: form.secondaryColor,
        ui_theme:        form.uiTheme,
        sidebar_style:   form.sidebarStyle,
        accent_style:    form.accentStyle ?? 'gradient',
      })
      .eq('id', brandingTargetId);
    if (error) throw error;
    await refresh();
    // Editing the team the super admin belongs to must also refresh the
    // cached session company, or BrandingVars/Sidebar keep the old look
    // until a full reload (same fix the company-admin path got).
    if (brandingTargetId === company?.id) await refreshSession?.().catch(() => {});
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {isSuperAdmin ? 'Platform Settings' : isAdmin ? 'Team Settings' : 'Settings'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSuperAdmin
            ? 'Manage teams, configure modules, and set team branding across the platform.'
            : isAdmin
            ? "Configure your team's branding, modules, and members."
            : 'Configure your default project settings.'}
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="px-4 pt-3">
          <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        <div className="p-5">
          {/* ── SUPER ADMIN: Teams ─────────────────────────────────── */}
          {activeTab === 'teams' && isSuperAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Building2 size={16} /> Create a Team
                </h2>
                <form onSubmit={createTeam} className="flex flex-wrap items-end gap-2">
                  <Field label="Team name" className="flex-1">
                    <TextInput
                      value={newTeam.name}
                      onChange={(e) => setNewTeam((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Acme Networks"
                      required
                    />
                  </Field>
                  <Field label="First Admin email (optional)" className="flex-1">
                    <TextInput
                      type="email"
                      value={newTeam.adminEmail}
                      onChange={(e) => setNewTeam((s) => ({ ...s, adminEmail: e.target.value }))}
                      placeholder="admin@acme.com"
                    />
                  </Field>
                  <Button type="submit">Create Team</Button>
                </form>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-800">All Teams</h2>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[400px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                      <th className="py-2">Team</th>
                      <th className="py-2 text-right">Members</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50">
                        <td className="py-2 text-slate-700">{c.name}</td>
                        <td className="py-2 text-right tabular-nums text-slate-500">{memberCount(c.id)}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => deleteTeam(c)}
                            title="Delete team"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {companies.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-sm text-slate-400">
                          No teams yet — create one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>

              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <UserPlus size={16} /> Invite a Member
                </h2>
                <form
                  onSubmit={(e) => sendInvite(e, { email: invite.email, role: invite.role, companyId: invite.companyId || null })}
                  className="flex flex-wrap items-end gap-2"
                >
                  <Field label="Email" className="flex-1">
                    <TextInput
                      type="email"
                      value={invite.email}
                      onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Team">
                    <Select
                      value={invite.companyId}
                      onChange={(e) => setInvite((s) => ({ ...s, companyId: e.target.value }))}
                      required
                    >
                      <option value="">— select —</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Role">
                    <Select
                      value={invite.role}
                      onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}
                    >
                      <option value="user">User</option>
                      <option value="company_admin">Admin</option>
                      <option value="viewer">View Only</option>
                      <option value="guest">Guest</option>
                    </Select>
                    {invite.role === 'guest' && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        After the guest accepts, pick which customer account they can see in the Members table below.
                      </p>
                    )}
                  </Field>
                  <Button type="submit">Send Invite</Button>
                </form>
              </div>
            </div>
          )}

          {/* ── MODULE SETTINGS — super admin only ─────────────────── */}
          {activeTab === 'modules' && isSuperAdmin && (
            <div className="space-y-4">
              <CustomModulesPanel />
              <div className="space-y-1">
                <p className="text-sm text-slate-500">
                  Select a team to configure which modules they can access — and, per module,
                  which custom version they run.
                </p>
                <ModulesPanel companies={companies} />
              </div>
            </div>
          )}

          {/* ── BRANDING ──────────────────────────────────────────── */}
          {activeTab === 'branding' && (
            <div>
              {isSuperAdmin ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm text-slate-500">
                      Select a team to configure its logo and brand colors.
                    </p>
                    <Select
                      value={brandingTargetId}
                      onChange={(e) => setBrandingTargetId(e.target.value)}
                      className="w-60"
                    >
                      <option value="">— select a team —</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </div>
                  {brandingTargetId ? (
                    <BrandingForm
                      key={brandingTargetId}
                      initial={brandingInitial}
                      onSave={saveSuperBranding}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">Select a team above to edit its branding.</p>
                  )}
                </div>
              ) : (
                <BrandingForm
                  initial={{
                    companyName:    ownBranding.companyName    || '',
                    logo:           ownBranding.logo           || null,
                    logoLight:      ownBranding.logoLight      || null,
                    primaryColor:   ownBranding.primaryColor   || '#2563eb',
                    accentColor:    ownBranding.accentColor    || '#1e40af',
                    secondaryColor: ownBranding.secondaryColor || '#0891b2',
                    uiTheme:        ownBranding.uiTheme        || 'bold',
                    sidebarStyle:   ownBranding.sidebarStyle   || 'gradient',
                    accentStyle:    ownBranding.accentStyle    || 'gradient',
                  }}
                  onSave={saveOwnBranding}
                />
              )}
            </div>
          )}

          {/* ── MEMBERS ────────────────────────────────────────────── */}
          {activeTab === 'members' && (
            <div className="space-y-5">
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <UserPlus size={16} /> Invite a Member
                </h2>
                {isSuperAdmin ? (
                  <form
                    onSubmit={(e) => sendInvite(e, { email: invite.email, role: invite.role, companyId: invite.companyId || null })}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <Field label="Email" className="flex-1">
                      <TextInput
                        type="email"
                        value={invite.email}
                        onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Team">
                      <Select
                        value={invite.companyId}
                        onChange={(e) => setInvite((s) => ({ ...s, companyId: e.target.value }))}
                        required
                      >
                        <option value="">— select —</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Role">
                      <Select
                        value={invite.role}
                        onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}
                      >
                        <option value="user">User</option>
                        <option value="company_admin">Admin</option>
                        <option value="viewer">View Only</option>
                      </Select>
                    </Field>
                    <Button type="submit">Send Invite</Button>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => sendInvite(e, { email: invite.email, role: invite.role })}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <Field label="Email" className="flex-1">
                      <TextInput
                        type="email"
                        value={invite.email}
                        onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label="Role">
                      <Select
                        value={invite.role}
                        onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}
                      >
                        <option value="user">User</option>
                        <option value="company_admin">Admin</option>
                        <option value="viewer">View Only</option>
                      </Select>
                    </Field>
                    <Button type="submit">Send Invite</Button>
                  </form>
                )}
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-800">
                    {isSuperAdmin ? 'All Members' : 'Team Members'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Visits over</span>
                    <Segmented
                      value={activityPeriod}
                      onChange={setActivityPeriod}
                      options={[
                        { value: '24h', label: '24 hrs' },
                        { value: '7d', label: '7 days' },
                        { value: '30d', label: '30 days' },
                      ]}
                    />
                  </div>
                </div>
                <MembersTable
                  members={isSuperAdmin ? members : members.filter((m) => m.company_id === company?.id)}
                  companies={companies}
                  selfId={user?.id}
                  visitCounts={visitCounts}
                  onRole={setRole}
                  onRemove={removeMember}
                  onResend={resendInvite}
                  onReassign={isSuperAdmin ? reassignTeam : undefined}
                  onSaveProfile={saveProfile}
                  superAdmin={isSuperAdmin}
                  guestAccounts={guestAccounts}
                />
              </div>
            </div>
          )}

          {/* ── PRICING ────────────────────────────────────────────── */}
          {activeTab === 'pricing' && (
            <>
              <PricingDiscountsForm />
              <PricingPolicyForm />
              <RecurringSettingsForm />
            </>
          )}

          {/* LABOR: the task table behind every proposal's labor estimate */}
          {activeTab === 'labor' && <LaborTasksForm />}

          {tabs.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Nothing to configure for your role — team settings are managed by your admin.
            </p>
          )}
        </div>
      </Card>

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
