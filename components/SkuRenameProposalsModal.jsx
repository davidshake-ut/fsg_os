'use client';

// After the super admin renames a product's SKU, this modal lists every
// proposal in the target team that still references the OLD SKU (price
// overrides, custom lines, locked snapshots, design selections, saved BOMs)
// and updates the checked ones to the new SKU — all other values untouched.

import { useEffect, useState } from 'react';
import { X, Loader2, ArrowRight, FileCheck } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { Card, Button, StatusBadge } from '@/components/ui/primitives';
import { proposalSkuRefs, applySkuRename } from '@/lib/skuRename';
import { cn } from '@/lib/utils';

const PROPOSAL_COLS = 'id, project_name, version, status, price_overrides, custom_line_items, catalog_snapshot, inputs, bom_snapshot';

export default function SkuRenameProposalsModal({ rename, onClose, onToast }) {
  // rename: { from, to, companyId } | null
  const supabase = getSupabase();
  const [affected, setAffected] = useState(null); // null = loading
  const [checked, setChecked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  // The caller keys this component per rename, so state starts fresh each
  // time (affected = null = loading) — no reset-in-effect needed.
  useEffect(() => {
    if (!rename || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('saved_projects')
        .select(PROPOSAL_COLS)
        .eq('company_id', rename.companyId)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      const hits = (data ?? [])
        .map((p) => ({ project: p, refs: proposalSkuRefs(p, rename.from) }))
        .filter((h) => h.refs.length > 0);
      setAffected(hits);
      setChecked(new Set(hits.map((h) => h.project.id))); // default: update all
    })();
    return () => { cancelled = true; };
  }, [rename, supabase]);

  if (!rename) return null;

  const toggle = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const applySelected = async () => {
    setBusy(true);
    const failures = [];
    let updated = 0;
    for (const { project } of affected.filter((h) => checked.has(h.project.id))) {
      const patch = applySkuRename(project, rename.from, rename.to);
      if (!patch) continue;
      const { error } = await supabase
        .from('saved_projects')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', project.id);
      if (error) failures.push(`${project.project_name}: ${error.message}`);
      else updated++;
    }
    setBusy(false);
    onToast?.(failures.length
      ? { type: 'error', message: `Updated ${updated} proposal${updated !== 1 ? 's' : ''}; ${failures.length} failed — ${failures[0]}` }
      : { type: 'success', message: `Updated ${updated} proposal${updated !== 1 ? 's' : ''} to ${rename.to}.` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label="Update proposals with renamed SKU">
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden p-0">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Update proposals?</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-mono">{rename.from}</span>
              <ArrowRight size={11} className="text-slate-400" />
              <span className="font-mono font-semibold text-slate-700">{rename.to}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {affected === null ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 size={15} className="animate-spin" /> Scanning proposals…
            </p>
          ) : affected.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
              <FileCheck size={26} className="text-emerald-500" />
              No proposals reference {rename.from} — nothing to update.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                {affected.length} proposal{affected.length !== 1 ? 's' : ''} still reference{affected.length === 1 ? 's' : ''} the old SKU.
                Checked proposals are updated to the new SKU; everything else on them stays exactly as saved.
              </p>
              <div className="space-y-1.5">
                {affected.map(({ project, refs }) => (
                  <label key={project.id}
                    className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      checked.has(project.id) ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="checkbox" checked={checked.has(project.id)} onChange={() => toggle(project.id)}
                      className="mt-0.5 h-4 w-4 accent-blue-600" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{project.project_name}</span>
                        <span className="text-[11px] text-slate-400">v{project.version ?? 1}</span>
                        {project.status && <StatusBadge tone={project.status === 'accepted' ? 'success' : project.status === 'sent' ? 'info' : 'neutral'}>{project.status}</StatusBadge>}
                      </span>
                      <span className="text-[11px] text-slate-400">Found in: {refs.join(', ')}</span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" type="button" onClick={onClose}>
            {affected?.length ? 'Skip — leave proposals as-is' : 'Close'}
          </Button>
          {affected?.length > 0 && (
            <Button type="button" disabled={busy || checked.size === 0} onClick={applySelected}>
              {busy ? 'Updating…' : `Update ${checked.size} proposal${checked.size !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
