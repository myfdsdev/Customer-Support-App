import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supportService } from '../services/endpoints';
import { getSupportToken, clearSupportToken, toMessage } from '../services/api';
import { connectCustomerSocket, disconnectCustomerSocket } from '../socket/socket';

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

  const emitTyping = useCallback((typing) => {
    const s = socketRef.current;
    const id = conversationIdRef.current;
    if (!s?.connected || !id) return;
    s.emit(typing ? 'typing:start' : 'typing:stop', { conversationId: id });
  }, []);

  const product = home?.product || null;
  conversationIdRef.current = conversation?._id || null;

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

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('customer:ready', ({ conversationId }) => {
      if (conversationId) socket.emit('conversation:join', { conversationId });
    });

    socket.on('message:new', (message) => {
      if (message.isInternal) return; // defence in depth; server already filters
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
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
  const loadConversation = useCallback(async () => {
    if (!getSupportToken()) return;
    try {
      const data = await supportService.conversation(productSlug);
      setConversation(data.conversation);
      setMessages(data.messages || []);
      if (data.conversation?._id && socketRef.current?.connected) {
        socketRef.current.emit('conversation:join', { conversationId: data.conversation._id });
      }
    } catch (err) {
      if (err?.response?.status === 401) clearSupportToken();
    }
  }, [productSlug]);

  useEffect(() => {
    if (session?.supportToken) loadConversation();
  }, [session?.supportToken, loadConversation]);

  const sendMessage = useCallback(
    async (text) => {
      const content = String(text || '').trim();
      if (!content) return null;

      // Optimistic echo so the UI never feels laggy; replaced by the real
      // message when the server responds or the socket event lands.
      const tempId = `temp_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          senderType: 'customer',
          content,
          messageType: 'text',
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);

      const humanMode = conversation?.channel === 'human';
      if (!humanMode) setAiThinking(true);

      try {
        const data = await supportService.chat(productSlug, content);

        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m._id !== tempId);
          const next = [...withoutTemp];
          const add = (m) => {
            if (m && !next.some((x) => x._id === m._id)) next.push(m);
          };
          add(data.customerMessage);
          if (data.aiMessage) add(data.aiMessage);
          if (data.noticeMessage) add(data.noticeMessage);
          return next;
        });

        if (!conversation?._id && data.conversationId) {
          await loadConversation();
        } else if (data.mode === 'handoff') {
          setConversation((c) => (c ? { ...c, channel: 'human', status: 'unassigned', handoffRequested: true } : c));
        }

        return data;
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true, error: toMessage(err) } : m))
        );
        throw err;
      } finally {
        setAiThinking(false);
      }
    },
    [productSlug, conversation, loadConversation]
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
      setMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));
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
      isHumanMode: conversation?.channel === 'human',
      sendMessage,
      requestHuman,
      sendFeedback,
      identify,
      uploadFile,
      emitTyping,
      reloadConversation: loadConversation,
    }),
    [
      productSlug, product, home, loading, error, session, customer, conversation, messages,
      aiThinking, agentTyping, connected, sendMessage, requestHuman, sendFeedback, identify,
      uploadFile, emitTyping, loadConversation,
    ]
  );

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport() {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error('useSupport must be used inside a SupportProvider');
  return ctx;
}
