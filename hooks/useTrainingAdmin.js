'use client';

// Admin-side training data + mutations (Resources > Training admin tabs).
// All writes hit tables whose RLS restricts mutation to company_admin /
// super_admin — the UI hides these screens from other roles, the database
// enforces it. Auditable actions log through the house activity log.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activityLog';
import { notify } from '@/lib/notify';
import { PROOF_BUCKET } from '@/hooks/useTraining';
import { deriveAssignmentStatus } from '@/lib/training';
import { fmtDate } from '@/lib/format';

export function useTrainingAdmin(session, company, user) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId = user?.id;

  const [courses, setCourses] = useState([]);
  const [itemsByCourse, setItemsByCourse] = useState(new Map());
  const [assignments, setAssignments] = useState([]);   // whole-company, user + course joined
  const [completionCounts, setCompletionCounts] = useState(new Map()); // assignment_id -> done count
  const [certifications, setCertifications] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const [coursesRes, itemsRes, assignRes, compRes, certRes, memberRes] = await Promise.all([
      supabase.from('training_courses').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      supabase.from('training_course_items').select('*').eq('company_id', companyId).order('sort_order').order('created_at'),
      supabase.from('training_assignments')
        .select('*, users!training_assignments_user_id_fkey(id, full_name, email, role), training_courses(id, title, status)')
        .eq('company_id', companyId).order('assigned_at', { ascending: false }),
      supabase.from('training_item_completions').select('assignment_id').eq('company_id', companyId),
      supabase.from('training_certifications')
        .select('*, users!training_certifications_user_id_fkey(id, full_name, email, role)')
        .eq('company_id', companyId),
      supabase.from('users').select('id, full_name, email, role').eq('company_id', companyId).order('full_name'),
    ]);
    const err = coursesRes.error || itemsRes.error || assignRes.error || compRes.error || certRes.error || memberRes.error;
    setLoadError(err?.message ?? null);
    if (!err) {
      setCourses(coursesRes.data ?? []);
      const byCourse = new Map();
      for (const i of itemsRes.data ?? []) {
        if (!byCourse.has(i.course_id)) byCourse.set(i.course_id, []);
        byCourse.get(i.course_id).push(i);
      }
      setItemsByCourse(byCourse);
      setAssignments(assignRes.data ?? []);
      const done = new Map();
      for (const c of compRes.data ?? []) done.set(c.assignment_id, (done.get(c.assignment_id) ?? 0) + 1);
      setCompletionCounts(done);
      setCertifications(certRes.data ?? []);
      setMembers(memberRes.data ?? []);
    }
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, companyId, refresh]);

  // ── Courses ─────────────────────────────────────────────────────────────

  const createCourse = useCallback(async (data) => {
    const { data: c, error } = await supabase.from('training_courses')
      .insert({ company_id: companyId, created_by: userId, ...data })
      .select().single();
    if (error) throw error;
    await refresh();
    return c;
  }, [supabase, companyId, userId, refresh]);

  const updateCourse = useCallback(async (id, patch) => {
    const { error } = await supabase.from('training_courses')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const setCourseStatus = useCallback(async (course, status) => {
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'published') patch.published_at = course.published_at ?? new Date().toISOString();
    if (status === 'archived') patch.archived_at = new Date().toISOString();
    const { error } = await supabase.from('training_courses').update(patch).eq('id', course.id);
    if (error) throw error;
    if (status === 'published') {
      await logActivity(supabase, {
        companyId, actorId: userId,
        verb: 'training.course_published', entityType: 'training_course', entityId: course.id,
        label: `Course published: ${course.title}`,
      });
    }
    await refresh();
  }, [supabase, companyId, userId, refresh]);

  // Draft-only hard delete (UI enforces; DB cascades items).
  const deleteCourse = useCallback(async (id) => {
    const { error } = await supabase.from('training_courses').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const duplicateCourse = useCallback(async (course) => {
    const items = itemsByCourse.get(course.id) ?? [];
    const { data: copy, error } = await supabase.from('training_courses')
      .insert({
        company_id: companyId, created_by: userId,
        title: `${course.title} (copy)`, description: course.description,
        category: course.category, estimated_minutes: course.estimated_minutes,
        status: 'draft',
      })
      .select().single();
    if (error) throw error;
    if (items.length) {
      const { error: iErr } = await supabase.from('training_course_items').insert(
        items.map((i) => ({
          company_id: companyId, course_id: copy.id, sort_order: i.sort_order,
          title: i.title, description: i.description, item_type: i.item_type,
          kb_document_id: i.kb_document_id, resource_id: i.resource_id, external_url: i.external_url,
        }))
      );
      if (iErr) throw iErr;
    }
    await refresh();
    return copy;
  }, [supabase, companyId, userId, itemsByCourse, refresh]);

  // Reconcile the builder's item list against the DB: delete removed rows,
  // update kept rows (title/desc/order), insert new ones.
  const saveCourseItems = useCallback(async (courseId, nextItems) => {
    const current = itemsByCourse.get(courseId) ?? [];
    const keepIds = new Set(nextItems.filter((i) => i.id).map((i) => i.id));
    const toDelete = current.filter((i) => !keepIds.has(i.id)).map((i) => i.id);
    if (toDelete.length) {
      const { error } = await supabase.from('training_course_items').delete().in('id', toDelete);
      if (error) throw error;
    }
    for (let idx = 0; idx < nextItems.length; idx++) {
      const it = nextItems[idx];
      if (it.id) {
        const { error } = await supabase.from('training_course_items')
          .update({ sort_order: idx, title: it.title, description: it.description ?? null, updated_at: new Date().toISOString() })
          .eq('id', it.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('training_course_items').insert({
          company_id: companyId, course_id: courseId, sort_order: idx,
          title: it.title, description: it.description ?? null, item_type: it.item_type,
          kb_document_id: it.kb_document_id ?? null,
          resource_id: it.resource_id ?? null,
          external_url: it.external_url ?? null,
        });
        if (error) throw error;
      }
    }
    await refresh();
  }, [supabase, companyId, itemsByCourse, refresh]);

  // ── Assignments ─────────────────────────────────────────────────────────

  // Batch-create; the (course_id, user_id) unique constraint makes this
  // duplicate-safe (ignoreDuplicates upsert = insert … on conflict do nothing).
  const assignCourse = useCallback(async (course, targets, dueDate) => {
    if (!targets.length) return 0;
    const rows = targets.map((t) => ({
      company_id: companyId, course_id: course.id, user_id: t.user.id,
      assignment_source: t.source, source_reference: t.sourceReference,
      assigned_by: userId, due_date: dueDate || null,
    }));
    const { error } = await supabase.from('training_assignments')
      .upsert(rows, { onConflict: 'course_id,user_id', ignoreDuplicates: true });
    if (error) throw error;
    await logActivity(supabase, {
      companyId, actorId: userId,
      verb: 'training.assigned', entityType: 'training_course', entityId: course.id,
      label: `Training assigned: ${course.title} → ${targets.length} member${targets.length !== 1 ? 's' : ''}`,
    });
    // Ping each assignee (not the assigning admin) — best-effort like every
    // other notify() call site.
    for (const t of targets) {
      if (t.user.id === userId) continue;
      await notify(supabase, {
        companyId, userId: t.user.id,
        verb: 'training.assigned', entityType: 'training_course', entityId: course.id,
        label: `New training assigned: ${course.title}${dueDate ? ` (due ${fmtDate(dueDate)})` : ''}`,
        href: '/resources/training',
      });
    }
    await refresh();
    return rows.length;
  }, [supabase, companyId, userId, refresh]);

  const updateAssignment = useCallback(async (id, patch) => {
    const existing = assignments.find((a) => a.id === id);
    const { error } = await supabase.from('training_assignments')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    // Due-date changes ping the assignee (16.1) — skip no-ops and self.
    if ('due_date' in patch && existing && patch.due_date !== existing.due_date && existing.user_id !== userId) {
      await notify(supabase, {
        companyId, userId: existing.user_id,
        verb: 'training.due_changed', entityType: 'training_assignment', entityId: id,
        label: patch.due_date
          ? `Due date updated: ${existing.training_courses?.title ?? 'training'} is now due ${fmtDate(patch.due_date)}`
          : `Due date removed: ${existing.training_courses?.title ?? 'training'}`,
        href: '/resources/training',
      });
    }
    await refresh();
  }, [supabase, companyId, userId, assignments, refresh]);

  const removeAssignment = useCallback(async (id) => {
    const { error } = await supabase.from('training_assignments').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  const manualComplete = useCallback(async (assignment, note) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('training_assignments')
      .update({ status: 'completed', completed_at: now, completed_by: userId, completion_note: note?.trim() || null, updated_at: now })
      .eq('id', assignment.id);
    if (error) throw error;
    await logActivity(supabase, {
      companyId, actorId: userId,
      verb: 'training.manual_complete', entityType: 'training_assignment', entityId: assignment.id,
      label: `Training manually completed for ${assignment.users?.full_name || assignment.users?.email || 'member'}: ${assignment.training_courses?.title ?? 'course'}`,
    });
    await refresh();
  }, [supabase, companyId, userId, refresh]);

  // Reopen: clear the manual-completion stamp and derive the real status
  // from live completion counts.
  const reopenAssignment = useCallback(async (assignment) => {
    const total = (itemsByCourse.get(assignment.course_id) ?? []).length;
    const done = completionCounts.get(assignment.id) ?? 0;
    const status = deriveAssignmentStatus(done, total);
    const now = new Date().toISOString();
    const { error } = await supabase.from('training_assignments')
      .update({ status, completed_at: null, completed_by: null, completion_note: null, updated_at: now })
      .eq('id', assignment.id);
    if (error) throw error;
    await logActivity(supabase, {
      companyId, actorId: userId,
      verb: 'training.reopened', entityType: 'training_assignment', entityId: assignment.id,
      label: `Training reopened for ${assignment.users?.full_name || assignment.users?.email || 'member'}: ${assignment.training_courses?.title ?? 'course'}`,
    });
    await refresh();
  }, [supabase, companyId, userId, itemsByCourse, completionCounts, refresh]);

  // ── Certifications ──────────────────────────────────────────────────────

  const uploadProof = useCallback(async (file) => {
    const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
    const path = `${companyId}/training-proof/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, file);
    if (error) throw error;
    return { proof_path: path, proof_name: file.name };
  }, [supabase, companyId]);

  const createCertification = useCallback(async (data, proofFile) => {
    const proof = proofFile ? await uploadProof(proofFile) : {};
    const { error } = await supabase.from('training_certifications')
      .insert({ company_id: companyId, created_by: userId, ...data, ...proof });
    if (error) throw error;
    await logActivity(supabase, {
      companyId, actorId: userId,
      verb: 'training.cert_added', entityType: 'training_certification', entityId: null,
      label: `Certification added: ${data.name}`,
    });
    await refresh();
  }, [supabase, companyId, userId, uploadProof, refresh]);

  const updateCertification = useCallback(async (cert, patch, proofFile) => {
    let proof = {};
    if (proofFile) {
      proof = await uploadProof(proofFile);
      if (cert.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([cert.proof_path]);
    }
    const { error } = await supabase.from('training_certifications')
      .update({ ...patch, ...proof, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', cert.id);
    if (error) throw error;
    await refresh();
  }, [supabase, userId, uploadProof, refresh]);

  const deleteCertification = useCallback(async (cert) => {
    if (cert.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([cert.proof_path]);
    const { error } = await supabase.from('training_certifications').delete().eq('id', cert.id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return {
    courses, itemsByCourse, assignments, completionCounts, certifications, members,
    loading, loadError, refresh,
    createCourse, updateCourse, setCourseStatus, deleteCourse, duplicateCourse, saveCourseItems,
    assignCourse, updateAssignment, removeAssignment, manualComplete, reopenAssignment,
    createCertification, updateCertification, deleteCertification,
  };
}
