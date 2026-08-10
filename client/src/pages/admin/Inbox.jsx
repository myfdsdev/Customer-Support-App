import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Inbox as InboxIcon, ArrowLeft, RefreshCw } from 'lucide-react';
import { conversationService, productService, authService } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ConversationList from '../../components/admin/ConversationList';
import ChatPanel from '../../components/admin/ChatPanel';
import CustomerPanel from '../../components/admin/CustomerPanel';
import { EmptyState, Select } from '../../components/ui';
import { upsertMessage, markMessageFailed, markMessageSending, mergeMessages } from '../../utils/messages';
import { messagePreview } from '../../utils/preview';
import cn from '../../utils/cn';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'mine', label: 'Mine' },
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'resolved', label: 'Resolved' },
];

/**
 * Intercom-style three-column inbox.
 *
 * Desktop: list | chat | customer details.
 * Mobile:  one column at a time, list -> chat -> details.
 */
export default function Inbox() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { socket } = useAuth();
  const toast = useToast();

  const [filter, setFilter] = useState('all');
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState([]);
  const [counts, setCounts] = useState({});
  const [products, setProducts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileView, setMobileView] = useState('list');
  const [showDetails, setShowDetails] = useState(false);

  // Read inside socket handlers, which are registered once and must not close
  // over a stale conversation id.
  const openIdRef = useRef(null);
  openIdRef.current = conversationId || null;

  /* --- data loading ----------------------------------------------------- */
  const loadList = useCallback(async () => {
    try {
      const res = await conversationService.list({
        filter,
        productId: productId || undefined,
        search: search || undefined,
        limit: 60,
      });
      setConversations(res.data || []);
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setListLoading(false);
    }
  }, [filter, productId, search, toast]);

  const loadCounts = useCallback(() => {
    conversationService.counts().then(setCounts).catch(() => null);
  }, []);

  const loadDetail = useCallback(
    async (id, { silent } = {}) => {
      if (!id) {
        setDetail(null);
        return;
      }
      if (!silent) setDetailLoading(true);
      try {
        const data = await conversationService.get(id);
        setDetail(data);
      } catch (err) {
        toast.error(err.friendlyMessage);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
    authService.listAgents().then(setAgents).catch(() => null);
  }, []);

  useEffect(() => {
    setListLoading(true);
    const t = setTimeout(loadList, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, search]);

  // Once on mount. Afterwards the lifecycle handlers refresh counts explicitly,
  // so a list that merely reordered does not trigger a counts request.
  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadDetail(conversationId);
    if (conversationId) setMobileView('chat');
  }, [conversationId, loadDetail]);

  /* --- local state patching (no network) --------------------------------- */

  /**
   * Adds a message to the open thread. Used for the agent's own optimistic
   * bubble, for the socket acknowledgement, and for incoming `message:new` —
   * `upsertMessage` collapses all three onto one entry.
   */
  const applyMessage = useCallback((message) => {
    if (!message) return;
    setDetail((prev) => {
      if (!prev?.conversation) return prev;
      if (String(message.conversationId) !== String(prev.conversation._id)) return prev;
      return { ...prev, messages: upsertMessage(prev.messages, message) };
    });
  }, []);

  const failMessage = useCallback((clientMessageId, error) => {
    setDetail((prev) =>
      prev ? { ...prev, messages: markMessageFailed(prev.messages, clientMessageId, error) } : prev
    );
  }, []);

  const retryingMessage = useCallback((clientMessageId) => {
    setDetail((prev) =>
      prev ? { ...prev, messages: markMessageSending(prev.messages, clientMessageId) } : prev
    );
  }, []);

  /**
   * Repaints one inbox row in place: preview, timestamp, unread badge, order.
   * This is what replaces the old full-list refetch on every message.
   */
  const patchConversationRow = useCallback(
    (payload, { message } = {}) => {
      const id = String(payload?._id || payload?.conversationId || '');
      if (!id) return;

      setConversations((prev) => {
        const index = prev.findIndex((c) => String(c._id) === id);
        if (index === -1) return prev;

        const current = prev[index];
        const isOpen = String(openIdRef.current || '') === id;
        const fromCustomer = message?.senderType === 'customer';

        const next = [...prev];
        next[index] = {
          ...current,
          status: payload.status ?? current.status,
          priority: payload.priority ?? current.priority,
          channel: payload.channel ?? current.channel,
          assignedAgentId: payload.assignedAgentId
            ? current.assignedAgentId && String(current.assignedAgentId._id) === String(payload.assignedAgentId)
              ? current.assignedAgentId
              : { _id: payload.assignedAgentId, name: payload.assignedAgentName || current.assignedAgentId?.name }
            : current.assignedAgentId,
          lastMessageAt: message?.createdAt || payload.lastMessageAt || current.lastMessageAt,
          lastMessagePreview: message ? messagePreview(message) : payload.lastMessagePreview ?? current.lastMessagePreview,
          lastMessageSender: message?.senderType || payload.lastMessageSender || current.lastMessageSender,
          // The thread on screen is being read right now, so it never grows a badge.
          unreadForAgent: isOpen ? 0 : fromCustomer ? (current.unreadForAgent || 0) + 1 : current.unreadForAgent || 0,
        };

        // Newest activity first, matching the server's sort.
        if (index > 0) {
          const [row] = next.splice(index, 1);
          next.unshift(row);
        }
        return next;
      });
    },
    []
  );

  /* --- realtime ----------------------------------------------------------
   * Registered once. Message traffic is handled purely in local state; only
   * lifecycle events (which can move a conversation between filters) hit the
   * network. This is what removes the per-message round trips.
   * --------------------------------------------------------------------- */
  useEffect(() => {
    if (!socket) return undefined;

    // Conversations can enter or leave the current filter, so these still need
    // authoritative data — but they are rare compared to messages.
    const refreshLifecycle = () => {
      loadList();
      loadCounts();
    };

    const onNewMessage = (message) => {
      applyMessage(message);
      patchConversationRow({ _id: message.conversationId }, { message });
    };

    const onInternalNote = ({ message }) => {
      applyMessage(message);
    };

    // Message-driven conversation change: patch the row, never refetch.
    const onActivity = (payload) => {
      const { message, ...conversation } = payload || {};
      patchConversationRow(conversation, { message });
      if (message) applyMessage(message);
    };

    const onHandoff = ({ customer, product }) => {
      toast.info(`${customer?.name || 'A customer'} asked for a human on ${product?.name || 'a product'}`);
      refreshLifecycle();
    };

    // Presence only changes a dot; patch the affected rows in place.
    const onPresence = ({ customerId, presenceStatus }) => {
      if (!customerId) return;
      setConversations((prev) => {
        let touched = false;
        const next = prev.map((c) => {
          if (String(c.customerId?._id || c.customerId) !== String(customerId)) return c;
          if (c.customerPresence === presenceStatus) return c;
          touched = true;
          return { ...c, customerPresence: presenceStatus };
        });
        return touched ? next : prev;
      });
    };

    socket.on('message:new', onNewMessage);
    socket.on('message:internal', onInternalNote);
    socket.on('conversation:activity', onActivity);
    socket.on('presence:update', onPresence);

    socket.on('conversation:new', refreshLifecycle);
    socket.on('conversation:updated', refreshLifecycle);
    socket.on('conversation:assigned', refreshLifecycle);
    socket.on('conversation:resolved', refreshLifecycle);
    socket.on('conversation:handoff', onHandoff);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:internal', onInternalNote);
      socket.off('conversation:activity', onActivity);
      socket.off('presence:update', onPresence);
      socket.off('conversation:new', refreshLifecycle);
      socket.off('conversation:updated', refreshLifecycle);
      socket.off('conversation:assigned', refreshLifecycle);
      socket.off('conversation:resolved', refreshLifecycle);
      socket.off('conversation:handoff', onHandoff);
    };
  }, [socket, loadList, loadCounts, applyMessage, patchConversationRow, toast]);

  /* --- reconnect ---------------------------------------------------------
   * A dropped socket can miss messages. Resync exactly once per reconnect —
   * never on the first connect (the initial load already covered it) and never
   * during a healthy session.
   * --------------------------------------------------------------------- */
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (!socket) return undefined;

    const onConnect = async () => {
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      const openId = openIdRef.current;
      if (openId) {
        socket.emit('conversation:join', { conversationId: openId });
        try {
          const missed = await conversationService.listMessages(openId, { limit: 60 });
          setDetail((prev) =>
            prev?.conversation && String(prev.conversation._id) === String(openId)
              ? { ...prev, messages: mergeMessages(prev.messages, missed) }
              : prev
          );
        } catch {
          /* the list refresh below is enough to recover */
        }
      }
      loadList();
      loadCounts();
    };

    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [socket, loadList, loadCounts]);

  const select = (c) => {
    navigate(`/admin/inbox/${c._id}`);
    setMobileView('chat');
  };

  const refreshDetail = useCallback(() => {
    if (conversationId) loadDetail(conversationId, { silent: true });
    loadList();
    loadCounts();
  }, [conversationId, loadDetail, loadList, loadCounts]);

  const filterTabs = useMemo(
    () => FILTERS.map((f) => ({ ...f, count: counts[f.value] })),
    [counts]
  );

  return (
    <div className="flex h-full min-h-0">
      {/* ---------- Column 1: conversations ---------- */}
      <div
        className={cn(
          'flex w-full min-w-0 flex-col border-r border-ink-200 bg-white md:w-80 lg:w-96',
          mobileView !== 'list' && 'hidden md:flex'
        )}
      >
        <div className="border-b border-ink-200 p-3">
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-sm font-semibold text-ink-900">Inbox</h1>
            <button
              onClick={() => { loadList(); loadCounts(); }}
              className="ml-auto rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="input !py-1.5 pl-8 !text-xs"
            />
          </div>

          <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="mb-2" aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap gap-1">
            {filterTabs.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filter === f.value ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                )}
              >
                {f.label}
                {f.count > 0 && <span className="ml-1 opacity-80">{f.count}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <ConversationList
            conversations={conversations}
            loading={listLoading}
            activeId={conversationId}
            onSelect={select}
          />
        </div>
      </div>

      {/* ---------- Column 2: conversation ---------- */}
      <div className={cn('min-w-0 flex-1', mobileView !== 'chat' && 'hidden md:block')}>
        {mobileView === 'chat' && (
          <button
            onClick={() => { setMobileView('list'); navigate('/admin/inbox'); }}
            className="flex w-full items-center gap-1.5 border-b border-ink-200 bg-white px-3 py-2 text-sm text-ink-600 md:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Conversations
          </button>
        )}

        {!conversationId ? (
          <div className="flex h-full items-center justify-center bg-ink-50">
            <EmptyState
              icon={InboxIcon}
              title="Select a conversation"
              description="Pick a conversation from the list to see the full history, the AI summary and the customer's context."
            />
          </div>
        ) : detailLoading && !detail ? (
          <div className="flex h-full items-center justify-center bg-ink-50">
            <EmptyState icon={InboxIcon} title="Loading…" />
          </div>
        ) : (
          <ChatPanel
            data={detail}
            agents={agents}
            onRefresh={refreshDetail}
            onApplyMessage={applyMessage}
            onFailMessage={failMessage}
            onRetryingMessage={retryingMessage}
            onToggleDetails={() => setShowDetails((s) => !s)}
          />
        )}
      </div>

      {/* ---------- Column 3: customer ---------- */}
      {detail && (
        <div
          className={cn(
            'w-80 shrink-0 border-l border-ink-200',
            showDetails ? 'fixed inset-y-0 right-0 z-40 bg-white shadow-pop xl:static xl:shadow-none' : 'hidden xl:block'
          )}
        >
          {showDetails && (
            <button
              onClick={() => setShowDetails(false)}
              className="flex w-full items-center gap-1.5 border-b border-ink-200 px-3 py-2 text-sm text-ink-600 xl:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> Close
            </button>
          )}
          <CustomerPanel data={detail} onRefresh={refreshDetail} />
        </div>
      )}
    </div>
  );
}
