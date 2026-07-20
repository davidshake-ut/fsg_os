'use client';

// Learner-side training data (Resources > Training). Admin hooks arrive with
// the Phase 3 management screens. Supabase-only — training has no local-mode
// store; without Supabase the lists stay empty (same stance as attachments).

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Resource files and KB documents live in the kb-documents bucket (see
// hooks/useResources.js); certification proof documents live in the
// company-scoped entity-attachments bucket (0056), same as project/case
// attachments.
const FILE_BUCKET = 'kb-documents';
export const PROOF_BUCKET = 'entity-attachments';

async function withCounts(supabase, assignments) {
  if (!assignments.length) return [];
  const courseIds = [...new Set(assignments.map((a) => a.course_id))];
  const assignmentIds = assignments.map((a) => a.id);
  const [itemsRes, compRes] = await Promise.all([
    supabase.from('training_course_items').select('id, course_id').in('course_id', courseIds),
    supabase.from('training_item_completions').select('assignment_id').in('assignment_id', assignmentIds),
  ]);
  const totals = new Map();
  for (const i of itemsRes.data ?? []) totals.set(i.course_id, (totals.get(i.course_id) ?? 0) + 1);
  const done = new Map();
  for (const c of compRes.data ?? []) done.set(c.assignment_id, (done.get(c.assignment_id) ?? 0) + 1);
  return assignments.map((a) => ({
    ...a,
    total_items: totals.get(a.course_id) ?? 0,
    completed_items: done.get(a.id) ?? 0,
  }));
}

// ── My Training — the signed-in user's assignments ────────────────────────
export function useMyTraining(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId || !userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('training_assignments')
      .select('*, training_courses(id, title, description, category, estimated_minutes, status)')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false });
    setLoadError(error?.message ?? null);
    if (!error) setAssignments(await withCounts(supabase, data ?? []));
    setLoading(false);
  }, [supabase, companyId, userId]);

  useEffect(() => {
    if (!supabase || !session || !companyId || !userId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, userId, refresh]);

  return { assignments, loading, loadError, refresh, available: !!supabase };
}

// ── One assignment: course, ordered items, my completions ─────────────────
export function useTrainingAssignment(assignmentId, session, company, user) {
  const supabase = getSupabase();
  const userId = user?.id;

  const [assignment, setAssignment] = useState(null);
  const [items, setItems] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !assignmentId) return;
    const { data: a, error } = await supabase
      .from('training_assignments')
      .select('*, training_courses(id, title, description, category, estimated_minutes, status)')
      .eq('id', assignmentId)
      .single();
    if (error) { setLoadError(error.message); setLoading(false); return; }
    const [itemsRes, compRes] = await Promise.all([
      supabase.from('training_course_items').select('*').eq('course_id', a.course_id).order('sort_order').order('created_at'),
      supabase.from('training_item_completions').select('*').eq('assignment_id', assignmentId),
    ]);
    setAssignment(a);
    setItems(itemsRes.data ?? []);
    setCompletions(compRes.data ?? []);
    setLoadError(null);
    setLoading(false);
  }, [supabase, assignmentId]);

  useEffect(() => {
    if (!supabase || !session || !assignmentId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, assignmentId, refresh]);

  // Insert/delete the caller's own completion row. RLS restricts writes to
  // the assignment's owner, and the DB trigger recalculates assignment
  // status server-side — the refresh picks both up.
  const setItemDone = useCallback(async (courseItemId, done) => {
    if (!supabase || !assignment || !userId) return;
    if (done) {
      const { error } = await supabase.from('training_item_completions').insert({
        company_id: assignment.company_id,
        assignment_id: assignment.id,
        course_item_id: courseItemId,
        user_id: userId,
      });
      // 23505 = already recorded (double-click / race) — that's success.
      if (error && error.code !== '23505') throw error;
    } else {
      const { error } = await supabase.from('training_item_completions')
        .delete()
        .eq('assignment_id', assignment.id)
        .eq('course_item_id', courseItemId);
      if (error) throw error;
    }
    await refresh();
  }, [supabase, assignment, userId, refresh]);

  return { assignment, items, completions, loading, loadError, refresh, setItemDone };
}

// ── My Certifications ─────────────────────────────────────────────────────
export function useMyCertifications(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId || !userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('training_certifications')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_id', userId);
    setLoadError(error?.message ?? null);
    if (!error) setCertifications(data ?? []);
    setLoading(false);
  }, [supabase, companyId, userId]);

  useEffect(() => {
    if (!supabase || !session || !companyId || !userId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, userId, refresh]);

  return { certifications, loading, loadError, refresh };
}

// ── Opening course content ────────────────────────────────────────────────

const SAFE_URL = /^https?:\/\//i;

// Signed URL for a stored file. Defaults to the resources/KB bucket; pass
// PROOF_BUCKET for certification proof documents.
export async function openStoredFile(path, bucket = FILE_BUCKET) {
  const supabase = getSupabase();
  if (!supabase || !path) return;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
}

// Open a course item by type. KB articles route to the existing Knowledge
// Base viewer; resources open their file (signed URL) or link; external
// URLs open in a new tab — http(s) only.
export async function openCourseItem(item, { resource } = {}) {
  const supabase = getSupabase();
  if (item.item_type === 'kb_article' && item.kb_document_id) {
    window.open(`/knowledge?doc=${item.kb_document_id}`, '_blank', 'noopener');
    return;
  }
  if (item.item_type === 'external_url' && item.external_url) {
    if (SAFE_URL.test(item.external_url)) window.open(item.external_url, '_blank', 'noopener');
    return;
  }
  if (item.item_type === 'resource' && item.resource_id && supabase) {
    const r = resource ?? (await supabase.from('resources').select('url, file_path').eq('id', item.resource_id).single()).data;
    if (r?.file_path) { await openStoredFile(r.file_path); return; }
    if (r?.url && SAFE_URL.test(r.url)) window.open(r.url, '_blank', 'noopener');
  }
}
