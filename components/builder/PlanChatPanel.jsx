'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button, TextInput } from '@/components/ui/primitives';

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

// Ported from PlanScope's project chat (chat/retrieve.ts + respond.ts) —
// citation-grounded Q&A over one plan set's sheets and findings.
export function PlanChatPanel({ planSetId, session }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { messages: history } = await callPlanRoute(`/api/plan-sets/${planSetId}/chat`, session);
        if (!cancelled) setMessages(history);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [planSetId, session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    try {
      const result = await callPlanRoute(`/api/plan-sets/${planSetId}/chat`, session, { method: 'POST', body: { message: text } });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.text, citations: result.citations }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return <Loader2 size={14} className="animate-spin text-slate-400" />;

  return (
    <div className="flex h-96 flex-col rounded-lg border border-slate-200">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-400">Ask about this plan set — e.g. &ldquo;how many access points on T-101?&rdquo; or &ldquo;what&rsquo;s the unit mix?&rdquo;</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
            {m.citations?.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {m.citations.map((c) => (c.kind === 'sheet' ? c.sheetNumber ?? `p${c.pageNumber}` : c.description)).join(' · ')}
              </p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-2">
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask a question…"
          className="flex-1"
          disabled={sending}
        />
        <Button size="sm" onClick={send} disabled={sending || !input.trim()}>
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </Button>
      </div>
    </div>
  );
}
