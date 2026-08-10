import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supportService } from '../services/endpoints';
import { getSupportToken, clearSupportToken, toMessage } from '../services/api';
import { connectCustomerSocket, disconnectCustomerSocket, emitWithAck } from '../socket/socket';
import {
  createOptimisticMessage,
  upsertMessage,
  mergeMessages,
  markMessageFailed,
  markMessageSending,
} from '../utils/messages';

const SupportContext = createContext(null);

/** Spec asks for 20-30s; 25s keeps "online" accurate without being chatty. */
const HEARTBEAT_MS = 25000;

/**
 * Owns everything a customer support page needs: the product resolved from the
 * URL slug, the visitor session, presence heartbeat, the live socket and the
 * single continuous conversation (AI first, human later — never two threads).
 */
export function SupportProvider({ children }) {
  const { productSlug } = useParams();
  const location = useLocation();

  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const pageRef = useRef(location.pathname);
  pageRef.current = location.pathname;

  // Kept in a ref so socket emitters do not need to be rebuilt on every
  // conversation change.
  const conversationIdRef = useRef(null);
  // Distinguishes the first connect from a genuine reconnect.
  const hasConnectedRef = useRef(false);

  const emitTyping = useCallback((typing) => {
    const s = socketRef.current;
    const id = conversationIdRef.current;
    if (!s?.connected || !id) return;
    s.emit(typing ? 'typing:start' : 'typing:stop', { conversationId: id });
  }, []);

  const product = home?.product || null;
  conversationIdRef.current = conversation?._id || null;

  /**
   * The support mode the customer has chosen, taken from the route.
   * /live-support means "I want a person"; everything else is the assistant.
   * The server resolves a different conversation per mode, so opening
   * "Ask AI Assistant" after a past handoff reaches the AI again instead of
   * silently posting into the support queue.
   */
  const mode = location.pathname.endsWith('/live-support') ? 'human' : 'ai';
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /* --- bootstrap: product + session ------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const data = await supportService.home(productSlug);
        if (cancelled) return;
        setHome(data);

        const s = await supportService.startSession(productSlug, pageRef.current);
        if (cancelled) return;
        setSession(s);
        setCustomer(s.customer);
      } catch (err) {
        if (!cancelled) setError(toMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  /* --- socket ----------------------------------------------------------- */
  useEffect(() => {
    if (!session?.supportToken) return undefined;

    const socket = connectCustomerSocket(session.supportToken);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Reconnect: rejoin the room and sync once. Anything missed while the
      // socket was down is merged by id, so nothing duplicates.
      if (hasConnectedRef.current) {
        const id = conversationIdRef.current;
        if (id) {
          socket.emit('conversation:join', { conversationId: id });
          supportService
            .conversation(productSlug)
            .then((data) => setMessages((prev) => mergeMessages(prev, data.messages || [])))
            .catch(() => null);
        }
      }
      hasConnectedRef.current = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('customer:ready', ({ conversationId }) => {
      if (conversationId) socket.emit('conversation:join', { conversationId });
    });

    socket.on('message:new', (message) => {
      if (message.isInternal) return; // defence in depth; server already filters
      // Collapses the optimistic copy, the acknowledgement and this broadcast
      // onto a single bubble.
      setMessages((prev) => upsertMessage(prev, message));
      if (message.senderType === 'agent') setAgentTyping(false);
    });

    socket.on('typing:start', ({ who }) => who === 'agent' && setAgentTyping(true));
    socket.on('typing:stop', ({ who }) => who === 'agent' && setAgentTyping(false));

    socket.on('ai:thinking', () => setAiThinking(true));
    socket.on('ai:done', () => setAiThinking(false));

    socket.on('conversation:assigned', ({ agentName }) => {
      setConversation((c) => (c ? { ...c, status: 'active', agentName } : c));
    });
    socket.on('conversation:resolved', () => {
      setConversation((c) => (c ? { ...c, status: 'resolved' } : c));
    });
    socket.on('conversation:updated', (c) => {
      setConversation((prev) => (prev ? { ...prev, status: c.status || prev.status } : prev));
    });

    return () => {
      socket.removeAllListeners();
      disconnectCustomerSocket();
      socketRef.current = null;
    };
  }, [session?.supportToken]);

  /* --- presence heartbeat ---------------------------------------------- */
  useEffect(() => {
    if (!session?.supportToken || !productSlug) return undefined;

    // A backgrounded tab still beats, but reports "away". Stopping entirely
    // would let the sweeper mark a customer offline while their support page
    // is still open in another tab.
    const beat = () => {
      const payload = {
        currentPage: pageRef.current,
        presenceStatus: document.visibilityState === 'visible' ? 'online' : 'away',
      };
      // Prefer the socket (cheap); fall back to REST if it dropped.
      if (socketRef.current?.connected) socketRef.current.emit('presence:heartbeat', payload);
      else supportService.heartbeat(productSlug, payload).catch(() => null);
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    // Report the change immediately rather than waiting for the next interval.
    document.addEventListener('visibilitychange', beat);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [session?.supportToken, productSlug]);

  /* --- page tracking ---------------------------------------------------- */
  useEffect(() => {
    if (!session?.supportToken || !socketRef.current?.connected) return;
    socketRef.current.emit('presence:heartbeat', { currentPage: location.pathname, presenceStatus: 'online' });
  }, [location.pathname, session?.supportToken]);

  /* --- conversation ----------------------------------------------------- */
  const [otherOpen, setOtherOpen] = useState(null);

  const loadConversation = useCallback(async () => {
    if (!getSupportToken()) return;
    try {
      const data = await supportService.conversation(productSlug, modeRef.current);
      setConversation(data.conversation);
      setMessages(data.messages || []);
      setOtherOpen(data.otherOpen || null);
      if (data.conversation?._id && socketRef.current?.connected) {
        socketRef.current.emit('conversation:join', { conversationId: data.conversation._id });
      }
    } catch (err) {
      if (err?.response?.status === 401) clearSupportToken();
    }
  }, [productSlug]);

  // Reload when the session arrives and whenever the customer switches between
  // the assistant and live support, so each route shows its own thread.
  useEffect(() => {
    if (session?.supportToken) loadConversation();
  }, [session?.supportToken, loadConversation, mode]);

  /**
   * Delivers one customer message.
   *
   * Human chat goes over the socket and resolves as soon as the message is
   * stored. AI chat also goes over the socket: the acknowledgement fires when
   * the customer's own message is durable, and Gemini's reply arrives later via
   * `message:new` / `ai:done` — so the customer's bubble never waits on the model.
   *
   * REST is the fallback for both, carrying the same clientMessageId so a
   * fallback after a partially-delivered socket send cannot duplicate.
   */
  const deliverMessage = useCallback(
    async (optimistic, { humanMode }) => {
      const body = {
        conversationId: conversationIdRef.current,
        content: optimistic.content,
        clientMessageId: optimistic.clientMessageId,
        mode: modeRef.current,
      };

      // Socket needs an existing conversation to target; the very first message
      // has none yet, so that one goes over REST and creates it.
      const canUseSocket = socketRef.current?.connected && body.conversationId;

      if (canUseSocket) {
        try {
          const res = await emitWithAck(socketRef.current, 'message:send', body);
          if (res.message) setMessages((prev) => upsertMessage(prev, res.message));
          return { mode: res.mode || (humanMode ? 'human' : 'ai'), viaSocket: true };
        } catch (err) {
          if (['Not allowed', 'Message is too long'].includes(err.message)) throw err;
          // fall through to REST
        }
      }

      const data = await supportService.chat(
        productSlug,
        optimistic.content,
        optimistic.clientMessageId,
        modeRef.current
      );

      setMessages((prev) => {
        let next = prev;
        if (data.customerMessage) next = upsertMessage(next, data.customerMessage);
        if (data.aiMessage) next = upsertMessage(next, data.aiMessage);
        if (data.noticeMessage) next = upsertMessage(next, data.noticeMessage);
        return next;
      });

      if (!conversationIdRef.current && data.conversationId) await loadConversation();
      else if (data.mode === 'handoff') {
        setConversation((c) => (c ? { ...c, channel: 'human', status: 'unassigned', handoffRequested: true } : c));
      }

      return { ...data, viaSocket: false };
    },
    [productSlug, loadConversation]
  );

  const sendMessage = useCallback(
    async (text) => {
      const content = String(text || '').trim();
      if (!content) return null;

      const humanMode = conversation?.channel === 'human';

      // On screen before any network call happens.
      const optimistic = createOptimisticMessage({
        conversationId: conversationIdRef.current,
        senderType: 'customer',
        content,
      });
      setMessages((prev) => upsertMessage(prev, optimistic));

      if (!humanMode) setAiThinking(true);

      try {
        const result = await deliverMessage(optimistic, { humanMode });
        // The socket AI path keeps thinking until `ai:done`; REST already has
        // the answer by the time it resolves.
        if (humanMode || !result.viaSocket) setAiThinking(false);
        return result;
      } catch (err) {
        setMessages((prev) => markMessageFailed(prev, optimistic.clientMessageId, toMessage(err)));
        setAiThinking(false);
        throw err;
      }
    },
    [conversation, deliverMessage]
  );

  /** Re-sends a failed message under its original id. */
  const retryMessage = useCallback(
    async (message) => {
      setMessages((prev) => markMessageSending(prev, message.clientMessageId));
      try {
        await deliverMessage(message, { humanMode: conversation?.channel === 'human' });
      } catch (err) {
        setMessages((prev) => markMessageFailed(prev, message.clientMessageId, toMessage(err)));
      }
    },
    [deliverMessage, conversation]
  );

  const requestHuman = useCallback(
    async (reason) => {
      const data = await supportService.handoff(productSlug, reason);
      await loadConversation();
      return data;
    },
    [productSlug, loadConversation]
  );

  const sendFeedback = useCallback(
    async (helpful) => {
      const data = await supportService.feedback(productSlug, helpful);
      if (helpful) setConversation((c) => (c ? { ...c, status: 'resolved' } : c));
      return data;
    },
    [productSlug]
  );

  const identify = useCallback(
    async (payload) => {
      const data = await supportService.identify(productSlug, payload);
      setCustomer((c) => ({ ...c, ...data }));
      return data;
    },
    [productSlug]
  );

  const uploadFile = useCallback(
    async (file, caption = '') => {
      const fd = new FormData();
      fd.append('file', file);
      if (caption) fd.append('caption', caption);
      const message = await supportService.upload(productSlug, fd);
      setMessages((prev) => upsertMessage(prev, message));
      if (!conversation?._id) await loadConversation();
      return message;
    },
    [productSlug, conversation, loadConversation]
  );

  const value = useMemo(
    () => ({
      productSlug,
      product,
      home,
      loading,
      error,
      session,
      customer,
      conversation,
      messages,
      aiThinking,
      agentTyping,
      connected,
      mode,
      otherOpen,
      // Reflects the conversation actually on screen, not the route, so the
      // header can never claim "AI Assistant" while an agent is replying.
      isHumanMode: conversation?.channel === 'human',
      sendMessage,
      retryMessage,
      requestHuman,
      sendFeedback,
      identify,
      uploadFile,
      emitTyping,
      reloadConversation: loadConversation,
    }),
    [
      productSlug, product, home, loading, error, session, customer, conversation, messages,
      aiThinking, agentTyping, connected, mode, otherOpen, sendMessage, retryMessage, requestHuman,
      sendFeedback, identify, uploadFile, emitTyping, loadConversation,
    ]
  );

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error('useSupport must be used inside a SupportProvider');
  return ctx;
}
