'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Loader2, FileText, Trash2, MessageSquare } from 'lucide-react';
import { Card, Button, Badge, StatusBadge, EmptyState } from '@/components/ui/primitives';
import { getSupabase } from '@/lib/supabase/client';
import { PlanPageSelector } from './PlanPageSelector';
import { PlanChatPanel } from './PlanChatPanel';

const TRADES = [
  { value: 'access_control', label: 'Access Control' },
  { value: 'managed_wifi', label: 'Managed Wi-Fi' },
  { value: 'low_voltage', label: 'Low Voltage' },
];

// Statuses where the pipeline is actively working and the panel should
// keep polling GET /api/plan-sets/[id] for the next state.
const POLLING_STATUSES = new Set(['ingesting', 'classifying']);

async function callPlanRoute(path, session, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

const statusTone = { uploaded: 'neutral', ingesting: 'info', ready: 'success', classifying: 'info', failed: 'danger' };

/**
 * Upload a construction plan set, read it with the same AI pipeline as the
 * PlanScope prototype (sheet index, legend discovery, per-trade device
 * counts, site inventory, self-verification), and ask it questions — all
 * scoped to one Builder quote. Ported deliberately as a self-contained
 * reader: it does not write into the Wi-Fi/camera/DI calculators' inputs.
 * Feeding its findings into those calculators as real BOM inputs is a
 * follow-on step, not done here.
 */
export function PlanReaderCard({ savedProjectId, session }) {
  const [planSets, setPlanSets] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [selectedTrades, setSelectedTrades] = useState(new Set(['access_control']));
  const [uploading, setUploading] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // 'classify' | 'analyze' | null
  const [error, setError] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const refreshList = useCallback(async () => {
    if (!savedProjectId) return;
    const { planSets: list } = await callPlanRoute(`/api/plan-sets?savedProjectId=${savedProjectId}`, session);
    setPlanSets(list);
    if (list.length > 0 && !activeId) setActiveId(list[0].id);
  }, [savedProjectId, session, activeId]);

  const refreshDetail = useCallback(async (id) => {
    if (!id) return;
    const data = await callPlanRoute(`/api/plan-sets/${id}`, session);
    setDetail(data);
    setSelectedPages((prev) => (prev.size > 0 ? prev : new Set(data.sheets.map((s) => s.page_number))));
    return data;
  }, [session]);

  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { if (activeId) refreshDetail(activeId); }, [activeId, refreshDetail]);

  // Poll while ingest/classify is in flight, or an analysis is 'running'.
  useEffect(() => {
    clearInterval(pollRef.current);
    const planStatus = detail?.planSet?.status;
    const anyRunning = detail?.analyses?.some((a) => a.status === 'running');
    if (!activeId || (!POLLING_STATUSES.has(planStatus) && !anyRunning)) return;
    pollRef.current = setInterval(() => refreshDetail(activeId), 4000);
    return () => clearInterval(pollRef.current);
  }, [activeId, detail, refreshDetail]);

  async function handleUpload(file) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { planSetId, upload } = await callPlanRoute('/api/plan-sets', session, {
        method: 'POST',
        body: { savedProjectId, fileName: file.name },
      });

      const supabase = getSupabase();
      const { error: uploadError } = await supabase.storage.from('plan-sets').uploadToSignedUrl(upload.path, upload.token, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      await callPlanRoute(`/api/plan-sets/${planSetId}/ingest`, session, { method: 'POST' });
      await refreshList();
      setActiveId(planSetId);
      setSelectedPages(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleClassify() {
    setError(null);
    setBusyAction('classify');
    try {
      await callPlanRoute(`/api/plan-sets/${activeId}/classify`, session, { method: 'POST' });
      await refreshDetail(activeId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAnalyze() {
    setError(null);
    setBusyAction('analyze');
    try {
      await callPlanRoute(`/api/plan-sets/${activeId}/analyses`, session, {
        method: 'POST',
        body: { trades: Array.from(selectedTrades), selectedPages: Array.from(selectedPages) },
      });
      await refreshDetail(activeId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this plan set and everything read from it?')) return;
    await callPlanRoute(`/api/plan-sets/${id}`, session, { method: 'DELETE' });
    setActiveId(null);
    setDetail(null);
    await refreshList();
  }

  if (!savedProjectId) return null;

  const planSet = detail?.planSet;
  const sheets = detail?.sheets ?? [];
  const classified = sheets.some((s) => s.sheet_number || s.title || s.discipline);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <FileText size={14} className="text-blue-500" /> Plan Reader
        </h2>
        <label className="cursor-pointer">
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Uploading…' : 'Upload plan set'}
          </Button>
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Upload the full drawing set (PDF). It&rsquo;s read page by page, then you pick which pages matter before any device counting runs — no need to scope down a 500-page set yourself.
      </p>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {planSets === null ? (
        <Loader2 size={14} className="mt-4 animate-spin text-slate-400" />
      ) : planSets.length === 0 ? (
        <EmptyState icon={FileText} title="No plan set uploaded" description="Upload a PDF to start reading it." className="mt-4" />
      ) : (
        <div className="mt-4 space-y-4">
          {planSets.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {planSets.map((p) => (
                <button key={p.id} type="button" onClick={() => { setActiveId(p.id); setSelectedPages(new Set()); }} className={`rounded-full border px-2.5 py-1 text-xs ${p.id === activeId ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                  {p.file_name}
                </button>
              ))}
            </div>
          )}

          {planSet && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
              <div>
                <p className="font-medium text-slate-700">{planSet.file_name}</p>
                <p className="text-xs text-slate-400">{planSet.page_count > 0 ? `${planSet.page_count} pages` : 'Ingesting…'}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={statusTone[planSet.status] ?? 'neutral'} dot>{planSet.status}</StatusBadge>
                <button type="button" onClick={() => handleDelete(planSet.id)} title="Delete" className="text-slate-300 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}

          {planSet?.status === 'failed' && planSet.error && (
            <p className="text-xs text-red-600">{planSet.error}</p>
          )}

          {planSet?.status === 'ready' && !classified && (
            <Button size="sm" onClick={handleClassify} disabled={busyAction === 'classify'}>
              {busyAction === 'classify' ? <Loader2 size={13} className="animate-spin" /> : null}
              {busyAction === 'classify' ? 'Reading sheet index & legends…' : 'Read sheet index & legends'}
            </Button>
          )}

          {classified && sheets.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                {TRADES.map((t) => (
                  <label key={t.value} className="flex items-center gap-1.5 text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedTrades.has(t.value)}
                      onChange={(e) => {
                        const next = new Set(selectedTrades);
                        if (e.target.checked) next.add(t.value); else next.delete(t.value);
                        setSelectedTrades(next);
                      }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Pages to include</p>
                <PlanPageSelector sheets={sheets} selected={selectedPages} onChange={setSelectedPages} />
              </div>

              <Button
                size="sm"
                onClick={handleAnalyze}
                disabled={busyAction === 'analyze' || selectedTrades.size === 0 || selectedPages.size === 0 || detail?.analyses?.some((a) => a.status === 'running')}
              >
                {busyAction === 'analyze' || detail?.analyses?.some((a) => a.status === 'running') ? <Loader2 size={13} className="animate-spin" /> : null}
                Run analysis
              </Button>

              {detail?.legends?.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium text-slate-600">Legends discovered ({detail.legends.length})</summary>
                  <div className="mt-2 space-y-2">
                    {detail.legends.map((l) => (
                      <div key={l.id}>
                        <p className="font-medium">{l.trade.replace(/_/g, ' ')} — {(l.symbols ?? []).length} symbols</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {detail?.analyses?.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Analyses</p>
              {detail.analyses.map((a) => {
                const byTrade = {};
                for (const f of a.findings) {
                  (byTrade[f.trade] ??= []).push(f);
                }
                return (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{a.trades.join(', ')} · {a.selected_pages?.length ?? 0} pages</span>
                      <div className="flex items-center gap-2">
                        <Badge>${Number(a.cost_usd ?? 0).toFixed(2)}</Badge>
                        <StatusBadge tone={a.status === 'failed' ? 'danger' : a.status === 'completed' ? 'success' : 'info'} dot>{a.status}</StatusBadge>
                      </div>
                    </div>
                    {a.error && <p className="mt-1 text-xs text-red-600">{a.error}</p>}
                    {Object.entries(byTrade).map(([trade, findings]) => {
                      const total = findings.reduce((sum, f) => sum + f.count, 0);
                      return (
                        <div key={trade} className="mt-2">
                          <p className="text-xs font-medium text-slate-500">{trade.replace(/_/g, ' ')} — {findings.length} findings, {total} total</p>
                          <ul className="mt-1 text-xs text-slate-500">
                            {findings.slice(0, 8).map((f) => (
                              <li key={f.id} className="flex gap-2">
                                <span className="w-10 font-mono">{f.symbol ?? '—'}</span>
                                <span className="flex-1 truncate">{f.description}</span>
                                <span>×{f.count}</span>
                              </li>
                            ))}
                            {findings.length > 8 && <li className="text-slate-400">+ {findings.length - 8} more…</li>}
                          </ul>
                        </div>
                      );
                    })}
                    {a.siteInventory && (
                      <details className="mt-2 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium">Site inventory</summary>
                        <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify(a.siteInventory, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {planSet?.status === 'ready' && (
            <div>
              <button type="button" onClick={() => setShowChat((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600">
                <MessageSquare size={13} /> {showChat ? 'Hide' : 'Ask about this plan set'}
              </button>
              {showChat && <div className="mt-2"><PlanChatPanel planSetId={planSet.id} session={session} /></div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
