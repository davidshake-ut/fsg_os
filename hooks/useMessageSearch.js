'use client';

import { useCallback, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';

// Full-text message search via the search_messages RPC (migration 0037) —
// same debounced-RPC pattern as useResources' search. Results are scoped
// server-side to conversations the caller is a member of.
export function useMessageSearch() {
  const supabase = getSupabase();
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const timer = useRef(null);

  const search = useCallback((query, { conversationId = null, senderId = null } = {}) => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!supabase || !q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_messages', {
        p_query: q,
        p_conversation_id: conversationId,
        p_sender_id: senderId,
      });
      setSearchError(error?.message ?? null);
      setResults(error ? [] : (data ?? []));
      setSearching(false);
    }, 200);
  }, [supabase]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setResults([]);
    setSearching(false);
    setSearchError(null);
  }, []);

  return { results, searching, searchError, search, clear };
}
