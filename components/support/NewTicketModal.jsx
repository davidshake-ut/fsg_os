'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { Button, Field, TextInput, Select } from '@/components/ui/primitives';
import { CATEGORY_CONFIG } from '@/components/support/TicketPriorityBadge';

const EMPTY = { title: '', description: '', priority: 'medium', category: 'other', due_date: '', account_id: '', project_id: '', asset_id: '' };

export default function NewTicketModal({ open, onClose, onSave, accounts = [], projects = [] }) {
  const supabase = getSupabase();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  // Keyed by the project they were fetched for — stale entries from a
  // previously-selected project simply don't match and render as empty,
  // no synchronous reset needed.
  const [assetState, setAssetState] = useState({ projectId: null, list: [] });
  const firstRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { setForm(EMPTY); setErr(null); firstRef.current?.focus(); }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Assets for the chosen project, so "which device is this about" is
  // captured at creation instead of after the fact.
  useEffect(() => {
    if (!supabase || !form.project_id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('assets').select('id, name').eq('project_id', form.project_id).order('name');
      if (!cancelled) setAssetState({ projectId: form.project_id, list: data ?? [] });
    })();
    return () => { cancelled = true; };
  }, [supabase, form.project_id]);

  const assets = assetState.projectId === form.project_id ? assetState.list : [];

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // A chosen account narrows the project list to that customer's projects
  // (direct FK since migration 0040; unattributed projects stay visible).
  const visibleProjects = form.account_id
    ? projects.filter((p) => !p.crm_account_id || p.crm_account_id === form.account_id)
    : projects;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({
        title:       form.title.trim(),
        description: form.description.trim() || null,
        priority:    form.priority,
        category:    form.category,
        due_date:    form.due_date || null,
        account_id:  form.account_id || null,
        project_id:  form.project_id || null,
        asset_id:    form.asset_id || null,
      });
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="New Ticket"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Support Ticket</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject *" className="sm:col-span-2">
              <TextInput ref={firstRef} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Wi-Fi dropping in Building B" required />
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                {Object.entries(CATEGORY_CONFIG).map(([val, cfg]) => (
                  <option key={val} value={val}>{cfg.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due by (optional)">
              <TextInput type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </Field>
            {accounts.length > 0 && (
              <Field label="Account (optional)">
                <Select value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value, project_id: '', asset_id: '' }))}>
                  <option value="">— none —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
            {visibleProjects.length > 0 && (
              <Field label="Project (optional)">
                <Select value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, asset_id: '' }))}>
                  <option value="">— none —</option>
                  {visibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
            {form.project_id && assets.length > 0 && (
              <Field label="Asset (optional)" className="sm:col-span-2">
                <Select value={form.asset_id} onChange={(e) => set('asset_id', e.target.value)}>
                  <option value="">— none —</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Description" className="sm:col-span-2">
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4}
                placeholder="Describe the issue…"
                className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Open Ticket'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
