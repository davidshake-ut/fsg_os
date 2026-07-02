'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import {
  getResourcesSnapshot, getResourcesServerSnapshot,
  subscribeResources, writeResources, newResourceId,
} from '@/lib/resourcesLocalStore';

const BUCKET = 'kb-documents';

function getFileType(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.html') || n.endsWith('.htm'))             return 'html';
  if (n.endsWith('.md')   || n.endsWith('.markdown'))        return 'md';
  if (n.endsWith('.docx'))                                   return 'docx';
  if (n.endsWith('.doc'))                                    return 'doc';
  return 'txt';
}

async function extractText(file) {
  const t = getFileType(file);
  if (t === 'pdf') {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/kb/extract', { method: 'POST', body: form });
      return res.ok ? ((await res.json()).text ?? '') : '';
    } catch { return ''; }
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload  = (e) => {
      const raw = e.target?.result ?? '';
      if (t === 'html') {
        try {
          const doc = new DOMParser().parseFromString(raw, 'text/html');
          doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove());
          resolve((doc.body?.innerText ?? '').replace(/\s+/g, ' ').trim());
        } catch { resolve(''); }
      } else {
        resolve(raw);
      }
    };
    reader.onerror = () => resolve('');
    if (t === 'txt' || t === 'md' || t === 'html') reader.readAsText(file);
    else resolve('');
  });
}

export function useResources(session, company, user) {
  const supabase  = getSupabase();
  const localData = useSyncExternalStore(subscribeResources, getResourcesSnapshot, getResourcesServerSnapshot);
  const companyId = company?.id;
  const userId    = user?.id;

  const [remoteResources, setRemoteResources] = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [loadError,       setLoadError]       = useState(null);
  const [uploads,         setUploads]         = useState({});

  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (!supabase || !companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .eq('company_id', companyId)
      .order('category')
      .order('title');
    setLoadError(error?.message ?? null);
    if (!error) setRemoteResources(data ?? []);
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    if (!supabase || !session || !companyId) return;
    void refresh();
  }, [supabase, session, companyId, refresh]);

  const resources = supabase ? remoteResources : localData.resources;

  // ── Full-text search ──────────────────────────────────────────────────────
  const search = useCallback((query, { category = null, type = null } = {}) => {
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
        const q = query.toLowerCase();
        setSearchResults(
          resources
            .filter((r) =>
              r.title.toLowerCase().includes(q) ||
              (r.description ?? '').toLowerCase().includes(q)
            )
            .map((r) => ({ ...r, rank: 1, headline: r.description ?? '' }))
        );
        setSearchLoading(false);
        return;
      }
      const { data } = await supabase.rpc('search_resources', {
        p_query:    query.trim(),
        p_category: category || null,
        p_type:     type     || null,
      });
      setSearchResults(data ?? []);
      setSearchLoading(false);
    }, 150);
  }, [supabase, resources]);

  // ── Storage ───────────────────────────────────────────────────────────────
  const getSignedUrl = useCallback(async (path) => {
    if (!supabase || !path) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }, [supabase]);

  // ── Upload files ──────────────────────────────────────────────────────────
  const uploadDocuments = useCallback(async (files, { category = 'General', type = 'doc' } = {}) => {
    if (!supabase || !companyId) return;

    for (const file of files) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const setStatus = (patch) =>
        setUploads((u) => ({ ...u, [uid]: { ...u[uid], ...patch } }));

      setUploads((u) => ({ ...u, [uid]: { name: file.name, progress: 0, status: 'reading' } }));
      try {
        const contentText = await extractText(file);
        setStatus({ progress: 35, status: 'uploading' });

        const fileType = getFileType(file);
        const ext      = file.name.split('.').pop() ?? 'bin';
        const filePath = `${companyId}/${uid}.${ext}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
        });
        if (upErr) throw upErr;

        setStatus({ progress: 75, status: 'saving' });

        const { error: dbErr } = await supabase.from('resources').insert({
          company_id:   companyId,
          created_by:   userId,
          title:        file.name.replace(/\.[^/.]+$/, ''),
          type:         type || 'doc',
          category:     category || 'General',
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
  }, [supabase, companyId, userId, refresh]);

  // ── Create rich-text / HTML document ─────────────────────────────────────
  const createDocument = useCallback(async ({ title, category, type, description, html }) => {
    if (!supabase || !companyId) return;

    const uid      = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${companyId}/${uid}.html`;
    const blob     = new Blob([html], { type: 'text/html' });

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
      contentType: 'text/html',
    });
    if (upErr) throw upErr;

    let contentText = '';
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      parsed.querySelectorAll('script,style').forEach((el) => el.remove());
      contentText = (parsed.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
    } catch {}

    const { error: dbErr } = await supabase.from('resources').insert({
      company_id:   companyId,
      created_by:   userId,
      title:        title || 'Untitled',
      description:  description || null,
      type:         type || 'doc',
      category:     category || 'General',
      file_path:    filePath,
      file_type:    'html',
      file_size:    blob.size,
      content_text: contentText || null,
    });
    if (dbErr) throw dbErr;
    await refresh();
  }, [supabase, companyId, userId, refresh]);

  // ── Link / URL resource (guide, video, link, template) ───────────────────
  const createResource = useCallback(async (data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      const r = { id: newResourceId(), company_id: 'local', ...data, created_at: now, updated_at: now };
      writeResources((s) => ({ ...s, resources: [...s.resources, r] }));
      return r;
    }
    const { data: r, error } = await supabase
      .from('resources')
      .insert({ company_id: companyId, created_by: userId, ...data })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return r;
  }, [supabase, companyId, userId, refresh]);

  const updateResource = useCallback(async (id, data) => {
    const now = new Date().toISOString();
    if (!supabase) {
      writeResources((s) => ({
        ...s,
        resources: s.resources.map((r) => r.id === id ? { ...r, ...data, updated_at: now } : r),
      }));
      return;
    }
    const { error } = await supabase.from('resources').update({ ...data, updated_at: now }).eq('id', id);
    if (error) throw error;
    if (searchQuery) search(searchQuery);
    await refresh();
  }, [supabase, refresh, search, searchQuery]);

  const deleteResource = useCallback(async (id) => {
    if (!supabase) {
      writeResources((s) => ({ ...s, resources: s.resources.filter((r) => r.id !== id) }));
      return;
    }
    const resource = remoteResources.find((r) => r.id === id);
    if (resource?.file_path) {
      await supabase.storage.from(BUCKET).remove([resource.file_path]);
    }
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) throw error;
    if (searchQuery) search(searchQuery);
    await refresh();
  }, [supabase, remoteResources, refresh, search, searchQuery]);

  return {
    resources, loading, loadError, refresh,
    uploads,
    searchQuery, searchResults, searchLoading,
    search,
    uploadDocuments, createDocument, createResource,
    updateResource, deleteResource,
    getSignedUrl,
  };
}
