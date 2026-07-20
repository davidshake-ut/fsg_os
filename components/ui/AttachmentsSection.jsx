'use client';

// Shared attachments panel for a project or support case. Pass exactly one
// of projectId / ticketId; the panel handles listing, upload, download
// (signed URL), and delete on its own via useAttachments.

import { useRef, useState } from 'react';
import { Paperclip, FileText, Trash2, Loader2 } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useAttachments } from '@/hooks/useAttachments';
import { Button } from '@/components/ui/primitives';
import { fmtDate } from '@/lib/format';

const MAX_BYTES = 25 * 1024 * 1024; // matches the bucket's file_size_limit

function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}


export default function AttachmentsSection({ projectId = null, ticketId = null, className }) {
  const { session, company, user, canWrite } = useSession();
  const { attachments, loading, uploading, upload, download, remove, available } =
    useAttachments(session, company, user, { projectId, ticketId });
  const [err, setErr] = useState(null);
  const [removing, setRemoving] = useState(null);
  const inputRef = useRef(null);

  if (!available) return null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { setErr(`"${file.name}" is larger than the 25 MB limit.`); return; }
    setErr(null);
    try { await upload(file); }
    catch (ex) { setErr(ex.message); }
  };

  const handleRemove = async (att) => {
    setRemoving(att.id);
    try { await remove(att); }
    catch (ex) { setErr(ex.message); }
    finally { setRemoving(null); }
  };

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Attachments ({attachments.length})
        </h2>
        {canWrite && (
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
              {uploading ? 'Uploading…' : 'Attach file'}
            </Button>
          </>
        )}
      </div>

      {err && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {loading && attachments.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
          No files attached yet.
        </p>
      ) : (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div key={att.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <FileText size={14} className="text-slate-500" />
              </span>
              <button type="button" onClick={() => download(att)} className="min-w-0 flex-1 text-left" title="Download">
                <span className="block truncate text-sm font-medium text-slate-700 group-hover:text-blue-700">{att.file_name}</span>
                <span className="text-[11px] text-slate-400">
                  {fmtBytes(att.file_size)}
                  {att.uploader && <> · {att.uploader.full_name || att.uploader.email}</>}
                  {' · '}{fmtDate(att.created_at)}
                </span>
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  disabled={removing === att.id}
                  title="Delete file"
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
