'use client';

import { EditableField } from '@/components/ui/EditableFields';
import { Select } from '@/components/ui/primitives';

// Renders a module variant's custom field definitions (Custom Modules Phase
// D) with a record's values from its custom_fields jsonb. onSave(key, value)
// — the parent merges into the map and persists. Values a variant no longer
// defines are left untouched in the jsonb (nothing is ever destroyed by
// editing the variant).
export default function CustomFieldsSection({ fields = [], values = {}, onSave }) {
  if (!fields.length) return null;
  return (
    <>
      {fields.map((f) => {
        const val = values?.[f.key] ?? '';
        if (f.type === 'select') {
          const options = Array.isArray(f.options) ? f.options : [];
          return (
            <div key={f.key}>
              <p className="mb-1 text-xs font-medium text-slate-400">{f.label}</p>
              <Select
                className="h-8 text-xs"
                value={val}
                onChange={(e) => onSave(f.key, e.target.value || null)}
              >
                <option value="">—</option>
                {val && !options.includes(val) && <option value={val}>{val}</option>}
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </div>
          );
        }
        return (
          <EditableField
            key={f.key}
            label={f.label}
            value={val}
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            onSave={(v) => onSave(f.key, f.type === 'number' ? (v ? Number(v) : null) : (v || null))}
            placeholder="—"
          />
        );
      })}
    </>
  );
}
