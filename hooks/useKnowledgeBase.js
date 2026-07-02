'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

const BUCKET = 'kb-documents';

function getFileType(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf')  || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.html') || n.endsWith('.htm'))              return 'html';
  if (n.endsWith('.md')   || n.endsWith('.markdown'))         return 'md';
  if (n.endsWith('.docx'))                                    return 'docx';
  if (n.endsWith('.doc'))                                     return 'doc';
  return 'txt';
}

async function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target?.result ?? '');
    r.onerror = rej;
    r.readAsText(file);
  });
}

function stripHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
    return (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

async function extractText(file) {
  const t = getFileType(file);
  if (t === 'pdf') {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/kb/extract', { method: 'POST', body: form });
      if (!res.ok) return '';
      return (await res.json()).text ?? '';
    } catch { return ''; }
  }
  if (t === 'html') return stripHtml(await readAsText(file));
  if (t === 'txt' || t === 'md') return readAsText(file);
  return '';
}

export function useKnowledgeBase(session, company) {
  const supabase = getSupabase();

  const [groups,    setGroups]    = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [uploads,   setUploads]   = useState({});

  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (!supabase || !company?.id) return;
    setLoading(true);
    const companyId = company.id;
    const [gr, dr] = await Promise.all([
      supabase.from('kb_groups').select('*').eq('company_id', companyId).order('order_index').order('created_at'),
      supabase.from('kb_documents')
        .select('id,name,description,group_id,file_type,file_size,file_path,tags,created_at,updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    ]);
    setLoadError(gr.error?.message ?? dr.error?.message ?? null);
    if (!gr.error) setGroups(gr.data ?? []);
    if (!dr.error) setDocuments(dr.data ?? []);
    setLoading(false);
  }, [supabase, company?.id]);

  useEffect(() => {
    if (!supabase || !session || !company) return;
    void refresh();
  }, [supabase, session, company, refresh]);

  const search = useCallback((query, { groupId = null, fileType = null } = {}) => {
    setSearchQuery(query);
    clearTimeout(searchTimer.current);

    if (!query?.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      if (!supabase) {
        // Client-side fallback
        const q = query.toLowerCase();
        setSearchResults(
          documents
            .filter((d) =>
              d.name.toLowerCase().includes(q) ||
              (d.description ?? '').toLowerCase().includes(q)
            )
            .filter((d) => !groupId || d.group_id === groupId)
            .filter((d) => !fileType || d.file_type === fileType)
            .map((d) => ({ ...d, rank: 1, headline: d.description ?? '' }))
        );
        setSearchLoading(false);
        return;
      }

      const { data } = await supabase.rpc('search_kb', {
        p_query:    query.trim(),
        p_group_id: groupId  || null,
        p_type:     fileType || null,
      });
      setSearchResults(data ?? []);
      setSearchLoading(false);
    }, 150);
  }, [supabase, documents]);

  const getSignedUrl = useCallback(async (path) => {
    if (!supabase || !path) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }, [supabase]);

  const uploadDocuments = useCallback(async (files, groupId = null) => {
    if (!supabase || !company?.id) return;

    for (const file of files) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const setStatus = (patch) =>
        setUploads((u) => ({ ...u, [uid]: { ...u[uid], ...patch } }));

      setUploads((u) => ({ ...u, [uid]: { name: file.name, progress: 0, status: 'reading' } }));

      try {
        const contentText = await extractText(file);
        setStatus({ progress: 35, status: 'uploading' });

        const fileType = getFileType(file);
        const ext = file.name.split('.').pop() ?? 'bin';
        const filePath = `${company.id}/${uid}.${ext}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
        });
        if (upErr) throw upErr;

        setStatus({ progress: 75, status: 'saving' });

        const { error: dbErr } = await supabase.from('kb_documents').insert({
          company_id:   company.id,
          group_id:     groupId || null,
          name:         file.name.replace(/\.[^/.]+$/, ''),
          file_path:    filePath,
          file_type:    fileType,
          file_size:    file.size,
          content_text: contentText || null,
        });
        if (dbErr) throw dbErr;

        setStatus({ progress: 100, status: 'done' });
        setTimeout(() => setUploads((u) => { const n = { ...u }; delete n[uid]; return n; }), 2500);
        await refresh();
      } catch (err) {
        setStatus({ status: 'error', error: err.message ?? 'Upload failed' });
      }
    }
  }, [supabase, company, refresh]);

  const createGroup = useCallback(async (name, color = 'blue') => {
    if (!supabase || !company?.id) return;
    await supabase.from('kb_groups').insert({
      company_id: company.id, name, color, order_index: groups.length,
    });
    await refresh();
  }, [supabase, company, groups.length, refresh]);

  const updateGroup = useCallback(async (id, data) => {
    if (!supabase) return;
    await supabase.from('kb_groups').update(data).eq('id', id);
    await refresh();
  }, [supabase, refresh]);

  const deleteGroup = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from('kb_groups').delete().eq('id', id);
    await refresh();
  }, [supabase, refresh]);

  const updateDocument = useCallback(async (id, data) => {
    if (!supabase) return;
    await supabase.from('kb_documents')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (searchQuery) search(searchQuery);
    await refresh();
  }, [supabase, refresh, search, searchQuery]);

  const createDocument = useCallback(async ({ name, groupId, description, html }) => {
    if (!supabase || !company?.id) return;

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${company.id}/${uid}.html`;
    const blob = new Blob([html], { type: 'text/html' });

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
      contentType: 'text/html',
    });
    if (upErr) throw upErr;

    let contentText = '';
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      parsed.querySelectorAll('script,style').forEach((el) => el.remove());
      contentText = (parsed.body?.innerText ?? parsed.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    } catch {}

    const { error: dbErr } = await supabase.from('kb_documents').insert({
      company_id:   company.id,
      group_id:     groupId || null,
      name:         name || 'Untitled',
      description:  description || null,
      file_path:    filePath,
      file_type:    'html',
      file_size:    blob.size,
      content_text: contentText || null,
    });
    if (dbErr) throw dbErr;
    await refresh();
  }, [supabase, company, refresh]);

  const deleteDocument = useCallback(async (id) => {
    if (!supabase) return;
    const doc = documents.find((d) => d.id === id);
    if (doc?.file_path) {
      await supabase.storage.from(BUCKET).remove([doc.file_path]);
    }
    await supabase.from('kb_documents').delete().eq('id', id);
    if (searchQuery) search(searchQuery);
    await refresh();
  }, [supabase, documents, refresh, search, searchQuery]);

  return {
    groups, documents, loading, loadError,
    uploads,
    searchQuery, searchResults, searchLoading,
    search, refresh,
    uploadDocuments, createDocument,
    createGroup, updateGroup, deleteGroup,
    updateDocument, deleteDocument,
    getSignedUrl,
  };
}
