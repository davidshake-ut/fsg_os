'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import AuthGuard from '@/components/AuthGuard';
import OSShell from '@/components/OSShell';
import { useSession } from '@/components/SessionProvider';
import { useConversations } from '@/hooks/useConversations';
import { useConversation } from '@/hooks/useConversation';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import ConversationList from '@/components/messages/ConversationList';
import MessageThread from '@/components/messages/MessageThread';
import MessageSearch from '@/components/messages/MessageSearch';
import NewConversationModal from '@/components/messages/NewConversationModal';
import ErrorBanner from '@/components/ui/ErrorBanner';
import AppToast from '@/components/ui/AppToast';

function MessagesContent() {
  const { session, company, user, canWrite } = useSession();
  const supabase = getSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('c');

  const {
    conversations, loading: listLoading, loadError, refresh: refreshList, createConversation,
    setArchived, markUnread, leaveConversation,
  } = useConversations(session, company, user);
  const {
    conversation, members, memberStates, messages, loading: threadLoading, loadError: threadError,
    sending, sendMessage, refresh: refreshThread,
  } = useConversation(activeId, session, company, user);
  const { results, searching, searchError, search, clear } = useMessageSearch();

  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [senderFilter, setSenderFilter] = useState(null);
  const [people, setPeople] = useState([]);

  // Sender-filter dropdown options — same company-users pattern as the
  // new-conversation modal.
  useEffect(() => {
    if (!supabase || !session) return;
    void (async () => {
      const { data } = await supabase.from('users').select('id, full_name, email').order('full_name');
      setPeople(data ?? []);
    })();
  }, [supabase, session]);

  const selectConversation = (id) => router.push(`/messages?c=${id}`);

  // Opening a conversation marks it read (thread hook) — re-pull the list
  // shortly after so its bold/unread state clears immediately instead of
  // waiting for the next background poll.
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => refreshList({ silent: true }), 800);
    return () => clearTimeout(t);
  }, [activeId, refreshList]);

  const runSearch = (q, senderId) => {
    setQuery(q);
    search(q, { senderId });
  };

  const handleSenderChange = (senderId) => {
    setSenderFilter(senderId);
    search(query, { senderId });
  };

  const openSearchResult = (conversationId) => {
    setSearchOpen(false);
    clear();
    setQuery('');
    setSenderFilter(null);
    selectConversation(conversationId);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    clear();
    setQuery('');
    setSenderFilter(null);
  };

  const handleCreate = async (data) => {
    const convo = await createConversation(data);
    if (convo?.id) {
      selectConversation(convo.id);
      if (convo.reused) setToast({ type: 'success', message: 'Opened your existing conversation.' });
    }
    await refreshList();
  };

  const handleSend = async (body) => {
    await sendMessage(body);
    await refreshList();
  };

  const handleLeave = async (convo) => {
    await leaveConversation(convo.id);
    if (convo.id === activeId) router.push('/messages');
    setToast({ type: 'success', message: `Left ${convo.name || 'the conversation'}.` });
  };

  const handleMarkUnread = async (convo) => {
    // Marking the OPEN conversation unread would be undone instantly by the
    // thread's mark-read-on-open — step out of it first.
    if (convo.id === activeId) router.push('/messages');
    await markUnread(convo.id);
  };

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        activeId={searchOpen ? null : activeId}
        onSelect={openSearchResult}
        currentUserId={user?.id}
        loading={listLoading}
        onRefresh={refreshList}
        onNewConversation={() => setModalOpen(true)}
        onSearch={() => setSearchOpen(true)}
        searchActive={searchOpen}
        onArchive={(convo, archived) => setArchived(convo.id, archived)}
        onMarkUnread={handleMarkUnread}
        onLeave={handleLeave}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {loadError && <div className="p-4"><ErrorBanner error={loadError} onRetry={refreshList} /></div>}
        {threadError && <div className="p-4"><ErrorBanner error={threadError} onRetry={refreshThread} /></div>}
        {searchOpen ? (
          <MessageSearch
            query={query}
            onQueryChange={(q) => runSearch(q, senderFilter)}
            senderId={senderFilter}
            onSenderChange={handleSenderChange}
            people={people}
            results={results}
            searching={searching}
            searchError={searchError}
            onOpenResult={openSearchResult}
            onClose={closeSearch}
          />
        ) : (
          <MessageThread
            conversation={conversation}
            members={members}
            memberStates={memberStates}
            messages={messages}
            currentUserId={user?.id}
            onSend={handleSend}
            sending={sending}
            onRefresh={refreshThread}
            loading={threadLoading}
            canWrite={canWrite}
          />
        )}
      </div>

      {modalOpen && (
        <NewConversationModal
          currentUserId={user?.id}
          onCreate={handleCreate}
          onClose={() => setModalOpen(false)}
        />
      )}
      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AuthGuard>
      <OSShell>
        <Suspense fallback={null}>
          <MessagesContent />
        </Suspense>
      </OSShell>
    </AuthGuard>
  );
}
