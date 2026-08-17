import { useCallback, useEffect, useRef, useState } from 'react';
import { supportService } from '../../services/endpoints';
import { portalService } from '../../services/portalApi';
import { setSupportToken, getSupportToken } from '../../services/api';
import { connectCustomerSocket, disconnectCustomerSocket, emitWithAck } from '../../socket/socket';
import {
  createOptimisticMessage,
  upsertMessage,
  mergeMessages,
  markMessageFailed,
  markMessageSending,
} from '../../utils/messages';

/**
 * The portal's chat engine — a thin driver over the EXISTING support stack.
 *
 * It does NOT introduce a second chat system. It mints a support session for
 * the authenticated customer (server-verified ownership), stores the returned
 * support token, and then talks to the very same socket events and /support
 * REST endpoints the anonymous widget uses. Same Conversation/Message models,
 * same Gemini/RAG, same Admin Inbox, same optimistic-message + idempotency
 * primitives (createOptimisticMessage / upsertMessage / clientMessageId).
 *
 * `mode` is fixed by the page: 'ai' for the assistant page, 'human' for the
 * team page. The server resolves a separate conversation per mode, so the two
 * threads never leak into each other.
 */
export function usePortalChat({ slug, mode, intake }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);

  const socketRef = useRef(null);
  const convIdRef = useRef(null);
  const hasConnectedRef = useRef(false);
  const intakeSentRef = useRef(false);
  convIdRef.current = conversation?._id || null;

  const loadConversation = useCallback(async () => {
    if (!getSupportToken()) return null;
    try {
      const data = await supportService.conversation(slug, mode);
      setConversation(data.conversation);
      setMessages(data.messages || []);
      if (data.conversation?._id && socketRef.current?.connected) {
        socketRef.current.emit('conversation:join', { conversationId: data.conversation._id });
      }
      return data;
    } catch {
      return null;
    }
  }, [slug, mode]);

  /* --- bootstrap: mint a support session for this owned product --------- */
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    intakeSentRef.current = false;

    (async () => {
      try {
        const data = await portalService.startSupport(slug, { mode: mode === 'human' ? 'team' : 'ai' });
        if (cancelled) return;
        setSupportToken(data.supportToken);
        await loadConversation();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err.friendlyMessage || 'Could not start support for this product.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, mode, loadConversation]);

  /* --- socket ----------------------------------------------------------- */
  useEffect(() => {
    if (!ready) return undefined;
    const token = getSupportToken();
    if (!token) return undefined;

    const socket = connectCustomerSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (hasConnectedRef.current) {
        const id = convIdRef.current;
        if (id) {
          socket.emit('conversation:join', { conversationId: id });
          supportService
            .conversation(slug, mode)
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
      if (message.isInternal) return;
      setMessages((prev) => upsertMessage(prev, message));
      if (message.senderType === 'agent') setAgentTyping(false);
    });
    socket.on('typing:start', ({ who }) => who === 'agent' && setAgentTyping(true));
    socket.on('typing:stop', ({ who }) => who === 'agent' && setAgentTyping(false));
    socket.on('ai:thinking', () => setAiThinking(true));
    socket.on('ai:done', () => setAiThinking(false));
    socket.on('conversation:assigned', ({ agentName }) =>
      setConversation((c) => (c ? { ...c, status: 'active', agent: c.agent || { name: agentName } } : c))
    );
    socket.on('conversation:resolved', () =>
      setConversation((c) => (c ? { ...c, status: 'resolved' } : c))
    );

    return () => {
      socket.removeAllListeners();
      disconnectCustomerSocket();
      socketRef.current = null;
    };
  }, [ready, slug, mode]);

  /* --- presence heartbeat (reuses the support endpoint) ---------------- */
  useEffect(() => {
    if (!ready) return undefined;
    const beat = () => {
      const payload = {
        currentPage: `/portal/support/${slug}/${mode === 'human' ? 'team' : 'ai'}`,
        presenceStatus: document.visibilityState === 'visible' ? 'online' : 'away',
      };
      if (socketRef.current?.connected) socketRef.current.emit('presence:heartbeat', payload);
      else supportService.heartbeat(slug, payload).catch(() => null);
    };
    beat();
    const id = setInterval(beat, 25000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [ready, slug, mode]);

  const emitTyping = useCallback((typing) => {
    const s = socketRef.current;
    const id = convIdRef.current;
    if (!s?.connected || !id) return;
    s.emit(typing ? 'typing:start' : 'typing:stop', { conversationId: id });
  }, []);

  const deliverMessage = useCallback(
    async (optimistic) => {
      const body = {
        conversationId: convIdRef.current,
        content: optimistic.content,
        clientMessageId: optimistic.clientMessageId,
        mode,
      };
      const canUseSocket = socketRef.current?.connected && body.conversationId;
      if (canUseSocket) {
        try {
          const res = await emitWithAck(socketRef.current, 'message:send', body);
          if (res.message) setMessages((prev) => upsertMessage(prev, res.message));
          return res;
        } catch (err) {
          if (['Not allowed', 'Message is too long'].includes(err.message)) throw err;
          // fall through to REST
        }
      }
      const data = await supportService.chat(slug, optimistic.content, optimistic.clientMessageId, mode);
      setMessages((prev) => {
        let next = prev;
        if (data.customerMessage) next = upsertMessage(next, data.customerMessage);
        if (data.aiMessage) next = upsertMessage(next, data.aiMessage);
        return next;
      });
      if (!convIdRef.current && data.conversationId) await loadConversation();
      return data;
    },
    [slug, mode, loadConversation]
  );

  const sendMessage = useCallback(
    async (text) => {
      const content = String(text || '').trim();
      if (!content) return;
      const optimistic = createOptimisticMessage({
        conversationId: convIdRef.current,
        senderType: 'customer',
        content,
      });
      setMessages((prev) => upsertMessage(prev, optimistic));
      if (mode === 'ai') setAiThinking(true);
      try {
        await deliverMessage(optimistic);
      } catch (err) {
        setMessages((prev) => markMessageFailed(prev, optimistic.clientMessageId, err.message));
        setAiThinking(false);
      }
    },
    [deliverMessage, mode]
  );

  const retryMessage = useCallback(
    async (clientMessageId) => {
      const target = messages.find((m) => m.clientMessageId === clientMessageId);
      if (!target) return;
      setMessages((prev) => markMessageSending(prev, clientMessageId));
      if (mode === 'ai') setAiThinking(true);
      try {
        await deliverMessage(target);
      } catch (err) {
        setMessages((prev) => markMessageFailed(prev, clientMessageId, err.message));
        setAiThinking(false);
      }
    },
    [messages, deliverMessage, mode]
  );

  const uploadFile = useCallback(
    async (file, caption = '') => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      form.append('mode', mode);
      const message = await supportService.upload(slug, form);
      setMessages((prev) => upsertMessage(prev, message));
      return message;
    },
    [slug, mode]
  );

  /** Escalate an AI thread to the team (the existing handoff flow). */
  const switchToTeam = useCallback(async () => {
    try {
      await supportService.handoff(slug);
    } catch {
      /* ignore — the caller navigates to the team page regardless */
    }
  }, [slug]);

  /* --- one-time intake message ----------------------------------------- */
  // When the customer arrives from the support form with a category +
  // description, post it as the opening message so the AI/agent has context —
  // in the same conversation, via the same send path. No duplicate systems.
  useEffect(() => {
    if (!ready || intakeSentRef.current) return;
    if (messages.length > 0) {
      intakeSentRef.current = true; // resuming an existing thread; don't re-send
      return;
    }
    const desc = intake?.description?.trim();
    if (!desc && !intake?.category) return;
    intakeSentRef.current = true;
    const prefix = intake?.category ? `[${intake.category}] ` : '';
    sendMessage(`${prefix}${desc || 'I need help with this product.'}`);
  }, [ready, messages.length, intake, sendMessage]);

  return {
    ready,
    error,
    conversation,
    messages,
    connected,
    aiThinking,
    agentTyping,
    sendMessage,
    retryMessage,
    uploadFile,
    emitTyping,
    switchToTeam,
    reload: loadConversation,
  };
}
