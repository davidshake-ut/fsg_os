'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Field, TextInput, Select } from '@/components/ui/primitives';
import { STAGES } from '@/components/crm/PipelineBoard';

const EMPTY = { name: '', type: 'other', stage: 'new', phone: '', website: '', address: '', notes: '' };

export default function NewAccountModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Account name is required.'); return; }
    setSaving(true); setErr(null);
    try {
      await onSave({
        name:    form.name.trim(),
        type:    form.type,
        stage:   form.stage,
        phone:   form.phone.trim()   || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        notes:   form.notes.trim()   || null,
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
      role="dialog" aria-modal="true" aria-label="New Account"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Account</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account Name *" className="sm:col-span-2">
              <TextInput ref={firstRef} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Hotels Group" required />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="hospitality">Hospitality</option>
                <option value="senior_living">Senior Living</option>
                <option value="multi_family">Multi-Family</option>
                <option value="education">Education</option>
                <option value="healthcare">Healthcare</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Pipeline Stage">
              <Select value={form.stage} onChange={(e) => set('stage', e.target.value)}>
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Phone">
              <TextInput type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </Field>
            <Field label="Website">
              <TextInput value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://example.com" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <TextInput value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St, City, ST 00000" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Optional notes…"
                className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Account'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
