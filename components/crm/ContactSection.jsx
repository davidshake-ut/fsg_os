'use client';

import { useState } from 'react';
import { Plus, Trash2, Mail, Phone, Smartphone, User, Pencil, Building2 } from 'lucide-react';
import { Button, Field, TextInput, Select } from '@/components/ui/primitives';

export const CONTACT_ROLES = {
  primary:          'Primary Contact',
  billing:          'Billing',
  onsite:           'On-Site',
  property_manager: 'Property Manager',
  technical:        'Technical',
  other:            'Other',
};

const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', mobile: '', title: '', role: '', notes: '' };

const formFromContact = (c) => ({
  first_name: c.first_name ?? '', last_name: c.last_name ?? '',
  email: c.email ?? '', phone: c.phone ?? '', mobile: c.mobile ?? '',
  title: c.title ?? '', role: c.role ?? '', notes: c.notes ?? '',
});

const linkedPropertyIds = (c) => (c.crm_contact_properties ?? []).map((l) => l.property_id);

function ContactForm({ heading, submitLabel, initial, initialPropertyIds, properties, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [propertyIds, setPropertyIds] = useState(initialPropertyIds);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleProperty = (id) =>
    setPropertyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.first_name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim()  || null,
        email:      form.email.trim()      || null,
        phone:      form.phone.trim()      || null,
        mobile:     form.mobile.trim()     || null,
        title:      form.title.trim()      || null,
        role:       form.role              || null,
        notes:      form.notes.trim()      || null,
      }, propertyIds);
      onCancel();
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-600">{heading}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First Name *">
          <TextInput autoFocus value={form.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="Jane" required />
        </Field>
        <Field label="Last Name">
          <TextInput value={form.last_name} onChange={(e) => set('last_name', e.target.value)} placeholder="Smith" />
        </Field>
        <Field label="Title">
          <TextInput value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="IT Director" />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">— none —</option>
            {Object.entries(CONTACT_ROLES).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Phone">
          <TextInput type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
        </Field>
        <Field label="Mobile">
          <TextInput type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="(555) 000-0000" />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@example.com" />
        </Field>
        {properties.length > 0 && (
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Properties</p>
            <div className="flex flex-wrap gap-1.5">
              {properties.map((p) => {
                const on = propertyIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleProperty(p.id)} aria-pressed={on}
                    className={on
                      ? 'flex items-center gap-1 rounded-full border border-blue-300 bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700'
                      : 'flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300'}>
                    <Building2 size={11} /> {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3}
            placeholder="Prefers email · gate code 4412 · …"
            className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </Field>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

function ContactCard({ contact: c, propertyById, onEdit, onDelete }) {
  const propNames = linkedPropertyIds(c).map((id) => propertyById.get(id)?.name).filter(Boolean);
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <User size={15} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">
            {c.first_name}{c.last_name ? ` ${c.last_name}` : ''}
          </p>
          {c.role && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {CONTACT_ROLES[c.role] ?? c.role}
            </span>
          )}
        </div>
        {c.title && <p className="text-xs text-slate-500">{c.title}</p>}
        <div className="mt-1 flex flex-wrap gap-3">
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Mail size={11} /> {c.email}
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <Phone size={11} /> {c.phone}
            </a>
          )}
          {c.mobile && (
            <a href={`tel:${c.mobile}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <Smartphone size={11} /> {c.mobile}
            </a>
          )}
        </div>
        {propNames.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {propNames.map((name) => (
              <span key={name} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                <Building2 size={10} /> {name}
              </span>
            ))}
          </div>
        )}
        {c.notes && <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-400">{c.notes}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-all group-hover:opacity-100">
        <button onClick={onEdit} aria-label="Edit contact"
          className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} aria-label="Delete contact"
          className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function ContactSection({ contacts, properties = [], onAdd, onUpdate, onDelete, onSetProperties }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  const handleAdd = async (fields, propertyIds) => {
    const c = await onAdd(fields);
    if (c?.id && propertyIds.length > 0) await onSetProperties(c.id, propertyIds);
  };

  const handleEdit = (id) => async (fields, propertyIds) => {
    await onUpdate(id, fields);
    await onSetProperties(id, propertyIds);
  };

  return (
    <div className="max-w-2xl space-y-3">
      {contacts.length === 0 && !adding && (
        <p className="py-6 text-center text-sm text-slate-400">No contacts yet.</p>
      )}

      {contacts.map((c) => (
        editingId === c.id ? (
          <ContactForm key={c.id} heading="Edit Contact" submitLabel="Save Changes"
            initial={formFromContact(c)} initialPropertyIds={linkedPropertyIds(c)}
            properties={properties} onSave={handleEdit(c.id)} onCancel={() => setEditingId(null)} />
        ) : (
          <ContactCard key={c.id} contact={c} propertyById={propertyById}
            onEdit={() => { setAdding(false); setEditingId(c.id); }} onDelete={() => onDelete(c.id)} />
        )
      ))}

      {adding
        ? <ContactForm heading="New Contact" submitLabel="Add Contact"
            initial={EMPTY_FORM} initialPropertyIds={[]}
            properties={properties} onSave={handleAdd} onCancel={() => setAdding(false)} />
        : (
          <button
            onClick={() => { setEditingId(null); setAdding(true); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={13} /> Add contact
          </button>
        )
      }
    </div>
  );
}
