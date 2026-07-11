'use client';

import { useEffect, useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { Button, Field, TextInput, Segmented } from '@/components/ui/primitives';
import { cn, initials } from '@/lib/utils';
import { toneClasses } from '@/lib/statusColors';

export default function NewConversationModal({ currentUserId, onCreate, onClose }) {
  const supabase = getSupabase();
  const [kind, setKind] = useState('dm'); // 'dm' | 'group'
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]); // user ids
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.from('users').select('id, full_name, email').order('full_name');
      setPeople((data ?? []).filter((p) => p.id !== currentUserId));
    })();
  }, [supabase, currentUserId]);

  const filtered = people.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });

  const toggle = (id) => {
    if (kind === 'dm') { setSelected([id]); return; }
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const canSubmit = kind === 'dm' ? selected.length === 1 : selected.length > 0 && name.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      await onCreate({ type: kind, name: kind === 'group' ? name.trim() : null, memberIds: selected });
      onClose();
    } catch (ex) {
      setErr(ex.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Conversation</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

          <Segmented
            value={kind}
            onChange={(v) => { setKind(v); setSelected([]); }}
            options={[
              { value: 'dm', label: 'Direct Message' },
              { value: 'group', label: 'Group Channel' },
            ]}
          />

          {kind === 'group' && (
            <Field label="Channel name">
              <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering Help" />
            </Field>
          )}

          <Field label={kind === 'dm' ? 'Who do you want to message?' : 'Add members'}>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <TextInput className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" />
            </div>
          </Field>

          <div className="space-y-0.5">
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No matching people.</p>}
            {filtered.map((p) => {
              const isSelected = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    isSelected ? toneClasses('info', { border: false }) : 'hover:bg-slate-50'
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {initials(p.full_name, p.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{p.full_name || p.email}</span>
                    {p.full_name && <span className="block truncate text-xs text-slate-400">{p.email}</span>}
                  </span>
                  {isSelected && <Check size={16} className="shrink-0 text-[var(--brand,#2563eb)]" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canSubmit || saving}>
            {saving ? 'Creating…' : kind === 'dm' ? 'Start Conversation' : 'Create Channel'}
          </Button>
        </div>
      </form>
    </div>
  );
}
