'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, UserPlus, Building2, Puzzle, Palette, Users, Upload, X, SlidersHorizontal, DollarSign } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { useBranding } from '@/hooks/useBranding';
import { useProducts } from '@/hooks/useProducts';
import { Card, Button, Field, TextInput, Select, Badge, Toggle, NumberInput } from '@/components/ui/primitives';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ModulesPanel from '@/components/ModulesPanel';
import { resolveBuilderDefaults, BUILDER_DEFAULTS_KEY } from '@/lib/builderDefaults';
import { costFromDiscount, DEFAULT_PRODUCT_LINE_DISCOUNTS } from '@/lib/pricing';
import { cn } from '@/lib/utils';

// ── Tab definitions ────────────────────────────────────────────────────────

const SA_TABS = [
  { key: 'teams',    label: 'Teams',           Icon: Building2          },
  { key: 'modules',  label: 'Module Settings', Icon: Puzzle             },
  { key: 'branding', label: 'Team Branding',   Icon: Palette            },
  { key: 'pricing',  label: 'Pricing',         Icon: DollarSign         },
  { key: 'members',  label: 'Members',         Icon: Users              },
  { key: 'builder',  label: 'Builder',         Icon: SlidersHorizontal  },
];

const CA_TABS = [
  { key: 'branding', label: 'Branding', Icon: Palette           },
  { key: 'modules',  label: 'Modules',  Icon: Puzzle            },
  { key: 'pricing',  label: 'Pricing',  Icon: DollarSign        },
  { key: 'members',  label: 'Members',  Icon: Users             },
  { key: 'builder',  label: 'Builder',  Icon: SlidersHorizontal },
];

const USER_TABS = [
  { key: 'builder', label: 'Builder', Icon: SlidersHorizontal },
];

// ── Branding form (shared by super admin + company admin) ─────────────────

function BrandingForm({ initial, onSave }) {
  const [form, setForm]     = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState(null);
  const fileRef             = useRef();

  useEffect(() => { setForm(initial); }, [JSON.stringify(initial)]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogoFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => set('logo', { dataUrl: ev.target.result, w: img.naturalWidth, h: img.naturalHeight });
      img.src = ev.target.result;
    };
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

      {/* Logo */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Logo</p>
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
            style={{ background: form.accentColor }}
          >
            Accent
          </span>
          {form.logo?.dataUrl && (
            <img src={form.logo.dataUrl} alt="Company logo" className="ml-auto h-7 w-auto object-contain" />
          )}
        </div>
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

function MembersTable({ members, companies, selfId, onRole, onRemove, onReassign, superAdmin }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="py-2 pr-2">Name</th>
            <th className="py-2 pr-2">Email</th>
            {superAdmin && <th className="py-2 pr-2">Team</th>}
            <th className="py-2 pr-2">Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const isSelf  = m.id === selfId;
            const isSuper = m.role === 'super_admin';
            return (
              <tr key={m.id} className="border-b border-slate-50">
                <td className="py-2 pr-2 text-slate-700">
                  {m.full_name || '—'}
                  {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
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
                    <Select
                      className="h-8 w-32"
                      value={m.role}
                      onChange={(e) => onRole(m.id, e.target.value)}
                    >
                      <option value="user">User</option>
                      <option value="company_admin">Admin</option>
                    </Select>
                  )}
                </td>
                <td className="py-2 text-right">
                  {!isSelf && !isSuper && (
                    <button
                      onClick={() => onRemove(m)}
                      title="Remove from team"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {members.length === 0 && (
            <tr>
              <td colSpan={superAdmin ? 5 : 4} className="py-6 text-center text-sm text-slate-400">
                No members yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Builder defaults ──────────────────────────────────────────────────────

function BuilderDefaultsForm() {
  const supabase = getSupabase();
  const { user, company, isAdmin, refresh: refreshSession } = useSession();
  // Admins edit the team-wide default; regular users edit a personal override.
  const teamScope = isAdmin && !!company;

  const [form, setForm] = useState(() =>
    resolveBuilderDefaults({ user, company, configured: isSupabaseConfigured })
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      if (!supabase) {
        localStorage.setItem(BUILDER_DEFAULTS_KEY, JSON.stringify(form));
      } else if (teamScope) {
        const settings = { ...(company.settings ?? {}), builderDefaults: form };
        const { error } = await supabase.from('companies').update({ settings }).eq('id', company.id);
        if (error) throw error;
      } else {
        const preferences = { ...(user?.preferences ?? {}), builderDefaults: form };
        const { error } = await supabase.rpc('set_own_preferences', { prefs: preferences });
        if (error) throw error;
      }
      await refreshSession?.().catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      <p className="text-xs text-slate-400">
        {teamScope
          ? 'These defaults apply to everyone on your team when starting a new project.'
          : 'These defaults apply to you when starting a new project (they override your team defaults).'}
      </p>
      <div>
        <h3 className="mb-0.5 text-sm font-semibold text-slate-800">Technologies</h3>
        <p className="text-xs text-slate-400">Which systems are enabled by default when starting a new project.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
        <Toggle checked={form.includeWifi} onChange={(v) => set('includeWifi', v)} label="Managed Wi-Fi" />
        <Toggle checked={form.includeCameras} onChange={(v) => set('includeCameras', v)} label="Camera Systems" />
      </div>
      <div>
        <h3 className="mb-0.5 text-sm font-semibold text-slate-800">Shipping</h3>
        <p className="text-xs text-slate-400">Default shipping estimate for new projects.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
        <Toggle checked={form.includeShipping} onChange={(v) => set('includeShipping', v)} label="Add Shipping Estimate" />
        {form.includeShipping && (
          <Field label="Shipping (% of hardware)">
            <NumberInput value={form.shippingPercent} onChange={(v) => set('shippingPercent', v)} />
          </Field>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Defaults'}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved!</span>}
      </div>
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
            sku: p.sku,
            description: p.desc,
            category: p.category,
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
  const [activeTab, setActiveTab] = useState(tabs[0].key);

  const [companies, setCompanies] = useState([]);
  const [members,   setMembers]   = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const [invite,  setInvite]  = useState({ email: '', role: 'user', companyId: '' });
  const [newTeam, setNewTeam] = useState({ name: '', adminEmail: '' });

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
      return true;
    } catch {
      flash('err', 'Network error — check your connection and try again.');
      return false;
    }
  };

  const sendInvite = async (e, body) => {
    e.preventDefault();
    if (await api('/api/invite', 'POST', body)) {
      flash('ok', `Invitation sent to ${body.email}.`);
      setInvite({ email: '', role: 'user', companyId: '' });
    }
  };

  const setRole      = (userId, role)      => api('/api/members', 'PATCH',  { userId, role });
  const removeMember = (m) => {
    setConfirmState({
      title: 'Remove member',
      message: `Remove ${m.email} from their team? They will lose access immediately.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        if (await api('/api/members', 'DELETE', { userId: m.id })) flash('ok', `${m.email} removed.`);
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
  const { branding: ownBranding, setBranding: saveOwnBranding } = useBranding({
    configured: isSupabaseConfigured,
    company,
    onSaved: refresh,
  });

  // ── Branding for super admin targeting a specific team
  const brandingTarget = companies.find((c) => c.id === brandingTargetId) ?? null;
  const brandingInitial = brandingTarget
    ? {
        companyName:   brandingTarget.name            || '',
        logo:          brandingTarget.logo            || null,
        primaryColor:  brandingTarget.primary_color   || '#2563eb',
        accentColor:   brandingTarget.accent_color    || '#1e40af',
      }
    : { companyName: '', logo: null, primaryColor: '#2563eb', accentColor: '#1e40af' };

  const saveSuperBranding = async (form) => {
    if (!supabase || !brandingTargetId) return;
    const { error } = await supabase
      .from('companies')
      .update({
        name:          form.companyName,
        logo:          form.logo ?? null,
        primary_color: form.primaryColor,
        accent_color:  form.accentColor,
      })
      .eq('id', brandingTargetId);
    if (error) throw error;
    await refresh();
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
                    </Select>
                  </Field>
                  <Button type="submit">Send Invite</Button>
                </form>
              </div>
            </div>
          )}

          {/* ── MODULE SETTINGS ────────────────────────────────────── */}
          {activeTab === 'modules' && (
            <div>
              {isSuperAdmin ? (
                <div className="space-y-1">
                  <p className="text-sm text-slate-500">
                    Select a team to configure which modules they can access.
                  </p>
                  <ModulesPanel companies={companies} />
                </div>
              ) : (
                <ModulesPanel />
              )}
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
                    companyName:  ownBranding.companyName  || '',
                    logo:         ownBranding.logo         || null,
                    primaryColor: ownBranding.primaryColor || '#2563eb',
                    accentColor:  ownBranding.accentColor  || '#1e40af',
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
                      </Select>
                    </Field>
                    <Button type="submit">Send Invite</Button>
                  </form>
                )}
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-800">
                  {isSuperAdmin ? 'All Members' : 'Team Members'}
                </h2>
                <MembersTable
                  members={isSuperAdmin ? members : members.filter((m) => m.company_id === company?.id)}
                  companies={companies}
                  selfId={user?.id}
                  onRole={setRole}
                  onRemove={removeMember}
                  onReassign={isSuperAdmin ? reassignTeam : undefined}
                  superAdmin={isSuperAdmin}
                />
              </div>
            </div>
          )}

          {/* ── PRICING ────────────────────────────────────────────── */}
          {activeTab === 'pricing' && (
            <PricingDiscountsForm />
          )}

          {/* ── BUILDER DEFAULTS ───────────────────────────────────── */}
          {activeTab === 'builder' && (
            <BuilderDefaultsForm />
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
