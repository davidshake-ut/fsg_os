'use client';

import { useState } from 'react';
import { Sparkles, Loader2, ListChecks, RefreshCw } from 'lucide-react';
import { Card, Button, Select, TextInput } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const MAX_NOTES_CHARS = 6000;

async function callAiRoute(path, session, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'AI request failed');
  return payload;
}

function ProjectSummaryCard({ projectId, session }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const { summary } = await callAiRoute('/api/ai/project-summary', session, { projectId });
      setSummary(summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Sparkles size={14} className="text-violet-500" /> AI Project Summary
        </h2>
        {summary && !loading && (
          <button type="button" onClick={generate} className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600">
            <RefreshCw size={11} /> Regenerate
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {summary ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{summary}</p>
      ) : (
        <div className="mt-3">
          <p className="mb-3 text-xs text-slate-400">Generate a plain-English status digest from this project&rsquo;s milestones, tasks, change orders, and recent activity.</p>
          <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? 'Generating…' : 'Generate Summary'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function NotesToTasksCard({ session, milestones, onCreateTask }) {
  const [notes, setNotes] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [proposed, setProposed] = useState(null); // [{title, description, role, estimated_hours, checked}]
  const [creating, setCreating] = useState(false);

  const generate = async () => {
    setLoading(true); setError(null); setProposed(null);
    try {
      const { tasks } = await callAiRoute('/api/ai/notes-to-tasks', session, { notes });
      if (tasks.length === 0) setError('No actionable tasks found in those notes.');
      setProposed(tasks.map((t) => ({ ...t, checked: true })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i) => setProposed((list) => list.map((t, ii) => ii === i ? { ...t, checked: !t.checked } : t));
  const editTitle = (i, title) => setProposed((list) => list.map((t, ii) => ii === i ? { ...t, title } : t));

  const addSelected = async () => {
    const selected = proposed.filter((t) => t.checked);
    if (selected.length === 0) return;
    setCreating(true);
    try {
      for (const t of selected) {
        await onCreateTask({
          milestone_id: milestoneId || null,
          title: t.title,
          description: t.description || null,
          role: t.role || null,
          status: 'todo',
          estimated_hours: t.estimated_hours || null,
        });
      }
      setProposed(null);
      setNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = proposed?.filter((t) => t.checked).length ?? 0;

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <ListChecks size={14} className="text-violet-500" /> Notes → Tasks
      </h2>
      <p className="mt-1 text-xs text-slate-400">Paste site survey, call, or meeting notes — AI proposes tasks for you to review before anything is created.</p>

      {!proposed && (
        <div className="mt-3 space-y-2">
          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_CHARS))}
            placeholder="e.g. Site survey 3/14 — need 4 more AP drops in east wing, front desk switch needs replacing before go-live, waiting on customer for camera placement approval in lobby…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{notes.length}/{MAX_NOTES_CHARS}</span>
            <Button size="sm" variant="outline" onClick={generate} disabled={loading || !notes.trim()}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {loading ? 'Analyzing…' : 'Generate Tasks'}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {proposed && proposed.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            {proposed.map((t, i) => (
              <label key={i} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2', t.checked ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60')}>
                <input type="checkbox" className="mt-0.5" checked={t.checked} onChange={() => toggle(i)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <TextInput className="h-7 text-sm font-medium" value={t.title} onChange={(e) => editTitle(i, e.target.value)} />
                  {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  <p className="text-[11px] text-slate-400">{t.role || 'Unassigned role'}{t.estimated_hours ? ` · ~${t.estimated_hours}h` : ''}</p>
                </div>
              </label>
            ))}
          </div>

          {milestones.length > 0 && (
            <Select className="h-8 w-full text-xs" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">No milestone (unassigned)</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setProposed(null); setError(null); }} disabled={creating}>Discard</Button>
            <Button size="sm" onClick={addSelected} disabled={creating || selectedCount === 0}>
              {creating ? <Loader2 size={13} className="animate-spin" /> : null}
              {creating ? 'Adding…' : `Add ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AIAssistantPanel({ projectId, session, milestones, onCreateTask }) {
  return (
    <div className="space-y-4">
      <ProjectSummaryCard projectId={projectId} session={session} />
      <NotesToTasksCard session={session} milestones={milestones} onCreateTask={onCreateTask} />
    </div>
  );
}
