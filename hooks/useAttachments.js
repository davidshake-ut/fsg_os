'use client';

// File attachments for a project or support case (migration 0056).
// Storage-backed only — in local/demo mode (no Supabase) the list stays
// empty and upload is unavailable, mirroring how quotes/invoices behave
// in useCRMAccount.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const BUCKET = 'entity-attachments';

export function useAttachments(session, company, user, { projectId = null, ticketId = null } = {}) {
  const supabase = getSupabase();
  const companyId = company?.id;
  const userId    = user?.id;

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || (!projectId && !ticketId)) return;
    setLoading(true);
    let query = supabase.from('attachments')
      .select('*, uploader:users!attachments_uploaded_by_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    query = projectId ? query.eq('project_id', projectId) : query.eq('ticket_id', ticketId);
    const { data, error } = await query;
    if (!error) setAttachments(data ?? []);
    setLoading(false);
  }, [supabase, projectId, ticketId]);

  useEffect(() => {
    if (!supabase || !session) return;
    void (async () => { await refresh(); })();
  }, [supabase, session, refresh]);

  const upload = useCallback(async (file) => {
    if (!supabase || !companyId || !file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\- ]+/g, '_');
      const path = `${companyId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from('attachments').insert({
        company_id: companyId,
        project_id: projectId,
        ticket_id: ticketId,
        uploaded_by: userId,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || null,
      });
      if (error) throw error;
      await refresh();
    } finally {
      setUploading(false);
    }
  }, [supabase, companyId, userId, projectId, ticketId, refresh]);

  const download = useCallback(async (attachment) => {
    if (!supabase) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }, [supabase]);

  const remove = useCallback(async (attachment) => {
    if (!supabase) return;
    // Storage first (best-effort), then the row — same order as useResources.
    await supabase.storage.from(BUCKET).remove([attachment.file_path]);
    const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
    if (error) throw error;
    await refresh();
  }, [supabase, refresh]);

  return { attachments, loading, uploading, refresh, upload, download, remove, available: !!supabase };
}
