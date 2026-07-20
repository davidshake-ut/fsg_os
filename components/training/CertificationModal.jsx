'use client';

// Add/edit a certification for an employee, with optional proof upload to
// the company-scoped entity-attachments bucket (25 MB limit, matching the
// bucket's file_size_limit).

import { useEffect, useRef, useState } from 'react';
import { X, Paperclip, ExternalLink } from 'lucide-react';
import { Button, Field, TextInput, Select } from '@/components/ui/primitives';
import { openStoredFile, PROOF_BUCKET } from '@/hooks/useTraining';

const MAX_PROOF_BYTES = 25 * 1024 * 1024;

const EMPTY = { user_id: '', name: '', issuing_org: '', cert_number: '', issue_date: '', expiry_date: '', notes: '' };

export default function CertificationModal({ open, cert, members, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [proofFile, setProofFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setForm({
        user_id: cert?.user_id ?? '',
        name: cert?.name ?? '',
        issuing_org: cert?.issuing_org ?? '',
        cert_number: cert?.cert_number ?? '',
        issue_date: cert?.issue_date ?? '',
        expiry_date: cert?.expiry_date ?? '',
        notes: cert?.notes ?? '',
      });
      setProofFile(null);
      setErr(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open, cert]);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_PROOF_BYTES) { setErr(`"${f.name}" is larger than the 25 MB limit.`); return; }
    setErr(null);
    setProofFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.user_id) { setErr('Choose an employee.'); return; }
    if (!form.name.trim()) { setErr('Certification name is required.'); return; }
    if (form.issue_date && form.expiry_date && form.expiry_date < form.issue_date) {
      setErr('Expiry date can’t be earlier than the issue date.');
      return;
    }
    setSaving(true); setErr(null);
    try {
      await onSave({
        user_id: form.user_id,
        name: form.name.trim(),
        issuing_org: form.issuing_org.trim() || null,
        cert_number: form.cert_number.trim() || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes.trim() || null,
      }, proofFile);
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={cert ? 'Edit Certification' : 'Add Certification'}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{cert ? 'Edit Certification' : 'Add Certification'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee *" className="sm:col-span-2">
              <Select value={form.user_id} onChange={(e) => set('user_id', e.target.value)} disabled={!!cert}>
                <option value="">— choose employee —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </Select>
            </Field>
            <Field label="Certification Name *" className="sm:col-span-2">
              <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="OSHA 30-Hour Construction" required />
            </Field>
            <Field label="Issuing Organization">
              <TextInput value={form.issuing_org} onChange={(e) => set('issuing_org', e.target.value)} placeholder="OSHA" />
            </Field>
            <Field label="Certification Number">
              <TextInput value={form.cert_number} onChange={(e) => set('cert_number', e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Issue Date">
              <TextInput type="date" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
            </Field>
            <Field label="Expiry Date" sub="Leave empty for non-expiring">
              <TextInput type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
            </Field>
            <Field label="Proof Document" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
                <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Paperclip size={13} /> {proofFile ? 'Replace selected file' : cert?.proof_path ? 'Replace proof' : 'Attach proof'}
                </Button>
                {proofFile ? (
                  <span className="text-xs text-slate-500">{proofFile.name}</span>
                ) : cert?.proof_path ? (
                  <button type="button" onClick={() => openStoredFile(cert.proof_path, PROOF_BUCKET)}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                    <ExternalLink size={11} /> {cert.proof_name || 'Current proof'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Optional — PDF or image, up to 25 MB</span>
                )}
              </div>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
                placeholder="Optional notes…"
                className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : cert ? 'Save Changes' : 'Add Certification'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
