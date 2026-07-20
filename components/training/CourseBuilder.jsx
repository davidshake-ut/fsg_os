'use client';

// Course builder modal: metadata + ordered items referencing existing KB
// documents, resources, or external URLs. Items reorder with the same
// dnd-kit sortable pattern the dashboard uses. This is deliberately NOT a
// content-authoring surface — it only points at content that already exists.

import { useEffect, useMemo, useState } from 'react';
import {
  X, Search, BookOpen, FileText, Link2, Plus, Trash2, GripVertical,
  Loader2, Eye, AlertTriangle, Check,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/components/SessionProvider';
import { Button, Field, TextInput } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const ITEM_META = {
  kb_article:   { label: 'Knowledge Base', icon: BookOpen },
  resource:     { label: 'Resource',       icon: FileText },
  external_url: { label: 'Link',           icon: Link2 },
};

const SAFE_URL = /^https?:\/\//i;

let itemKey = 0;
const nextKey = () => `new-${++itemKey}`;

function SortableItemRow({ item, onRemove, onRename }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item._key });
  const meta = ITEM_META[item.item_type] ?? ITEM_META.resource;
  const Icon = meta.icon;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2', isDragging && 'z-30 opacity-80 shadow-lg')}
    >
      <button type="button" {...attributes} {...listeners} aria-label="Reorder"
        className="cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical size={14} />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Icon size={13} className="text-slate-500" />
      </span>
      <input
        value={item.title}
        onChange={(e) => onRename(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm text-slate-800 outline-none hover:border-slate-200 focus:border-blue-400 focus:bg-white"
      />
      <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:block">{meta.label}</span>
      <button type="button" onClick={onRemove} aria-label="Remove item"
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// Picker for existing KB documents and resources + external URL entry.
// Explicitly company-scoped like every other query in the app — RLS alone
// isn't enough here because super_admin RLS sees every team's rows.
function ItemPicker({ onAdd, existingRefs }) {
  const supabase = getSupabase();
  const { company } = useSession();
  const companyId = company?.id;
  const [tab, setTab] = useState('kb'); // kb | resource | url
  const [query, setQuery] = useState('');
  const [kbDocs, setKbDocs] = useState(null);
  const [resources, setResources] = useState(null);
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  useEffect(() => {
    if (!supabase || !companyId) return;
    let cancelled = false;
    void (async () => {
      const [kbRes, resRes] = await Promise.all([
        supabase.from('kb_documents').select('id, name, file_type').eq('company_id', companyId).order('name'),
        supabase.from('resources').select('id, title, type, category').eq('company_id', companyId).order('title'),
      ]);
      if (cancelled) return;
      setKbDocs(kbRes.data ?? []);
      setResources(resRes.data ?? []);
    })();
    return () => { cancelled = true; };
  }, [supabase, companyId]);

  const q = query.trim().toLowerCase();
  const list = tab === 'kb'
    ? (kbDocs ?? []).filter((d) => !q || d.name.toLowerCase().includes(q))
    : (resources ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q));

  const addUrl = () => {
    const u = url.trim();
    if (!SAFE_URL.test(u) || !urlTitle.trim()) return;
    onAdd({ _key: nextKey(), item_type: 'external_url', external_url: u, title: urlTitle.trim() });
    setUrl(''); setUrlTitle('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex gap-1">
        {[['kb', 'Knowledge Base'], ['resource', 'Resources'], ['url', 'External URL']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
              tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/60')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'url' ? (
        <div className="space-y-2">
          <TextInput value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Display title (e.g. Vendor certification portal)" />
          <div className="flex gap-2">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="flex-1" />
            <Button type="button" size="sm" onClick={addUrl} disabled={!SAFE_URL.test(url.trim()) || !urlTitle.trim()}>
              <Plus size={13} /> Add
            </Button>
          </div>
          {url.trim() && !SAFE_URL.test(url.trim()) && (
            <p className="text-xs text-red-600">Links must start with http:// or https://</p>
          )}
        </div>
      ) : (
        <>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'kb' ? 'Search knowledge base…' : 'Search resources…'}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
          </div>
          <div className="max-h-44 space-y-0.5 overflow-y-auto">
            {list === null || (tab === 'kb' ? kbDocs : resources) === null ? (
              <p className="py-3 text-center text-xs text-slate-400"><Loader2 size={13} className="mr-1 inline animate-spin" /> Loading…</p>
            ) : list.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">No matches.</p>
            ) : list.map((row) => {
              const refKey = tab === 'kb' ? `kb:${row.id}` : `res:${row.id}`;
              const added = existingRefs.has(refKey);
              return (
                <button key={row.id} type="button" disabled={added}
                  onClick={() => onAdd(tab === 'kb'
                    ? { _key: nextKey(), item_type: 'kb_article', kb_document_id: row.id, title: row.name }
                    : { _key: nextKey(), item_type: 'resource', resource_id: row.id, title: row.title })}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                    added ? 'cursor-default text-slate-300' : 'text-slate-700 hover:bg-white')}>
                  {added ? <Check size={13} className="shrink-0 text-emerald-500" /> : <Plus size={13} className="shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate">{tab === 'kb' ? row.name : row.title}</span>
                  <span className="shrink-0 text-[10px] uppercase text-slate-300">{tab === 'kb' ? row.file_type : row.type}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function CourseBuilder({ open, course, initialItems = [], activeAssignmentCount = 0, categories = [], onClose, onSaveDraft, onPublish }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'General', estimated_minutes: '' });
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setForm({
        title: course?.title ?? '',
        description: course?.description ?? '',
        category: course?.category ?? 'General',
        estimated_minutes: course?.estimated_minutes ?? '',
      });
      setItems(initialItems.map((i) => ({ ...i, _key: i.id })));
      setPreview(false);
      setErr(null);
    }, 0);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const existingRefs = useMemo(() => new Set(items.flatMap((i) => [
    i.kb_document_id ? `kb:${i.kb_document_id}` : null,
    i.resource_id ? `res:${i.resource_id}` : null,
  ]).filter(Boolean)), [items]);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const payload = () => ({
    title: form.title.trim(),
    description: form.description.trim() || null,
    category: form.category.trim() || 'General',
    estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null,
  });

  const save = async (publish) => {
    if (!form.title.trim()) { setErr('Course title is required.'); return; }
    if (publish && items.length === 0) { setErr('Add at least one item before publishing.'); return; }
    setSaving(true); setErr(null);
    try {
      if (publish) await onPublish(payload(), items);
      else await onSaveDraft(payload(), items);
      onClose();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setItems((list) => {
      const from = list.findIndex((i) => i._key === active.id);
      const to = list.findIndex((i) => i._key === over.id);
      return arrayMove(list, from, to);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={course ? 'Edit Course' : 'New Course'}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{course ? 'Edit Course' : 'New Course'}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPreview((p) => !p)}
              className={cn('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                preview ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100')}>
              <Eye size={13} /> Preview
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          {course?.status === 'published' && activeAssignmentCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                This course is published with <b>{activeAssignmentCount} active assignment{activeAssignmentCount !== 1 ? 's' : ''}</b>.
                Adding or removing items changes every learner&apos;s progress; completions for removed items are lost.
              </span>
            </div>
          )}

          {preview ? (
            /* Learner-experience preview */
            <div className="space-y-3">
              <div>
                <p className="text-lg font-bold text-slate-900">{form.title || 'Untitled course'}</p>
                {form.description && <p className="mt-1 text-sm text-slate-500">{form.description}</p>}
              </div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No items yet.</p>
                ) : items.map((item) => {
                  const meta = ITEM_META[item.item_type] ?? ITEM_META.resource;
                  const Icon = meta.icon;
                  return (
                    <div key={item._key} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-6 w-6 shrink-0 rounded-full border-2 border-slate-300" />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Icon size={15} className="text-slate-500" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                        <span className="text-[11px] text-slate-400">{meta.label}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Course Title *" className="sm:col-span-2">
                  <TextInput value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Jobsite Safety Orientation" required />
                </Field>
                <Field label="Category">
                  <TextInput value={form.category} onChange={(e) => set('category', e.target.value)} list="training-course-categories" placeholder="General" />
                  <datalist id="training-course-categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </Field>
                <Field label="Estimated Duration (minutes)">
                  <TextInput type="number" min="1" value={form.estimated_minutes} onChange={(e) => set('estimated_minutes', e.target.value)} placeholder="45" />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
                    placeholder="What will this course cover, and who is it for?"
                    className="h-auto w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </Field>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Course Items ({items.length})
                </p>
                {items.length > 0 && (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={items.map((i) => i._key)} strategy={verticalListSortingStrategy}>
                      <div className="mb-3 space-y-1.5">
                        {items.map((item, idx) => (
                          <SortableItemRow
                            key={item._key}
                            item={item}
                            onRemove={() => setItems((l) => l.filter((_, i) => i !== idx))}
                            onRename={(title) => setItems((l) => l.map((it, i) => i === idx ? { ...it, title } : it))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
                <ItemPicker existingRefs={existingRefs} onAdd={(item) => setItems((l) => [...l, item])} />
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="outline" type="button" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button type="button" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Saving…' : course?.status === 'published' ? 'Save & Keep Published' : 'Publish'}
          </Button>
        </div>
      </div>
    </div>
  );
}
