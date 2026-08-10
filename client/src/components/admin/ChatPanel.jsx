import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, Paperclip, Lock, Sparkles, UserPlus, ArrowRightLeft, TicketPlus, Clock,
  CheckCircle2, XCircle, RotateCcw, Loader2, ChevronDown, Info, PanelRight,
} from 'lucide-react';
import { conversationService, ticketService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { emitWithAck } from '../../socket/socket';
import { createOptimisticMessage } from '../../utils/messages';
import AgentMessage from './AgentMessage';
import { Badge, Button, PresenceDot, Modal, Select, Textarea, Spinner, Alert } from '../ui';
import { humanize, timeAgo } from '../../utils/format';
import cn from '../../utils/cn';

const STATUS_TONE = {
  new: 'blue',
  unassigned: 'amber',
  active: 'green',
  waiting_customer: 'gray',
  waiting_team: 'amber',
  resolved: 'green',
  closed: 'gray',
};

export default function ChatPanel({
  data,
  onRefresh,
  onToggleDetails,
  agents,
  onApplyMessage,
  onFailMessage,
  onRetryingMessage,
}) {
  const toast = useToast();
  const { user, socket } = useAuth();

  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', category: 'Technical', priority: 'normal' });

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  const conversation = data?.conversation;
  const messages = data?.messages || [];
  const customer = data?.customer;
  const conversationId = conversation?._id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // Join the room and listen for the customer's typing indicator.
  useEffect(() => {
    if (!socket || !conversationId) return undefined;
    socket.emit('conversation:join', { conversationId });

    const onTypingStart = ({ conversationId: id, who }) => {
      if (String(id) === String(conversationId) && who === 'customer') setCustomerTyping(true);
    };
    const onTypingStop = ({ conversationId: id, who }) => {
      if (String(id) === String(conversationId) && who === 'customer') setCustomerTyping(false);
    };

    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      socket.emit('conversation:leave', { conversationId });
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
    };
  }, [socket, conversationId]);

  useEffect(() => {
    setSuggestion(null);
    setText('');
    setInternal(false);
  }, [conversationId]);

  if (!data) return <Spinner className="py-24" label="Loading conversation…" />;

  const resolved = ['resolved', 'closed'].includes(conversation.status);
  const mine = String(conversation.assignedAgentId?._id || conversation.assignedAgentId) === String(user?._id);

  const emitTyping = (isTyping) => {
    if (!socket || !conversationId) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId });
  };

  const onChangeText = (e) => {
    setText(e.target.value);
    if (internal) return; // internal notes should not show the customer a typing dot
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1500);
  };

  /**
   * Delivers one message. Socket first (with acknowledgement), REST only when
   * the socket is unavailable or does not answer.
   *
   * Both transports carry the same `clientMessageId`, so a fallback after a
   * half-delivered socket send cannot produce a second message — the server
   * recognises the key and returns the stored one.
   */
  const deliver = useCallback(
    async (optimistic) => {
      const body = {
        conversationId,
        content: optimistic.content,
        isInternal: optimistic.isInternal,
        clientMessageId: optimistic.clientMessageId,
      };

      try {
        const res = await emitWithAck(socket, 'message:send', body);
        onApplyMessage?.(res.message);
        return res.message;
      } catch (socketErr) {
        // Refusals are final — retrying over REST would just fail again.
        if (['Not allowed', 'Message is too long', 'Conversation not found'].includes(socketErr.message)) {
          throw socketErr;
        }
        const saved = await conversationService.send(conversationId, body);
        onApplyMessage?.(saved);
        return saved;
      }
    },
    [conversationId, socket, onApplyMessage]
  );

  /**
   * Send is fire-and-forget from the UI's point of view: the bubble is on
   * screen and the composer is clear before the network is touched at all.
   */
  async function send(e) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;

    const optimistic = createOptimisticMessage({
      conversationId,
      senderType: 'agent',
      senderId: user?._id,
      senderName: user?.name || 'You',
      content,
      isInternal: internal,
    });

    onApplyMessage?.(optimistic);
    setText('');
    setSuggestion(null);
    emitTyping(false);

    try {
      await deliver(optimistic);
    } catch (err) {
      onFailMessage?.(optimistic.clientMessageId, err.friendlyMessage || err.message || 'Message failed to send');
    }
  }

  /** Re-sends a failed message under its original id, so it stays idempotent. */
  const retry = useCallback(
    async (message) => {
      onRetryingMessage?.(message.clientMessageId);
      try {
        await deliver(message);
      } catch (err) {
        onFailMessage?.(message.clientMessageId, err.friendlyMessage || err.message || 'Message failed to send');
      }
    },
    [deliver, onFailMessage, onRetryingMessage]
  );

  /** Attachments stay on REST (multipart), but still patch state locally. */
  async function attach(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);
    if (text.trim()) fd.append('content', text.trim());
    if (internal) fd.append('isInternal', 'true');

    setSending(true);
    try {
      const saved = await conversationService.sendFile(conversationId, fd);
      onApplyMessage?.(saved);
      setText('');
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSending(false);
    }
  }

  async function act(fn, successMessage) {
    setActionsOpen(false);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
      onRefresh();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  async function getSuggestion() {
    setSuggesting(true);
    try {
      const s = await conversationService.suggestReply(conversationId);
      setSuggestion(s);
      if (!s.available) toast.info(s.reason || 'No suggestion available');
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSuggesting(false);
    }
  }

  async function createTicket() {
    if (!ticketForm.title.trim()) return;
    try {
      const t = await ticketService.create({ ...ticketForm, conversationId });
      toast.success(`Ticket ${t.ticketNumber} created`);
      setTicketOpen(false);
      setTicketForm({ title: '', description: '', category: 'Technical', priority: 'normal' });
      onRefresh();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div className="flex h-full flex-col bg-ink-50">
      {/* Header */}
      <div className="border-b border-ink-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-ink-900">
                {customer?.name || customer?.email || 'Anonymous visitor'}
              </p>
              <PresenceDot status={data.customerPresence?.presenceStatus || 'offline'} />
              <Badge tone="gray">{conversation.productId?.name}</Badge>
              <Badge tone={STATUS_TONE[conversation.status] || 'gray'}>{humanize(conversation.status)}</Badge>
              {conversation.priority !== 'normal' && (
                <Badge tone={conversation.priority === 'urgent' ? 'red' : 'amber'}>{conversation.priority}</Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-500">
              {conversation.assignedAgentId
                ? `Assigned to ${conversation.assignedAgentId.name}${mine ? ' (you)' : ''}`
                : 'Unassigned'}
              {conversation.detectedIntent && ` · ${conversation.detectedIntent}`}
            </p>
          </div>

          {!conversation.assignedAgentId && (
            <Button size="sm" onClick={() => act(() => conversationService.assign(conversationId), 'You accepted this conversation')}>
              <UserPlus className="h-4 w-4" /> Accept
            </Button>
          )}

          {!resolved && conversation.assignedAgentId && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => act(() => conversationService.resolve(conversationId), 'Conversation resolved')}
            >
              <CheckCircle2 className="h-4 w-4" /> Resolve
            </Button>
          )}

          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setActionsOpen((o) => !o)}>
              Actions <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {actionsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-pop">
                  <MenuItem icon={UserPlus} onClick={() => act(() => conversationService.assign(conversationId), 'Assigned to you')}>
                    Assign to me
                  </MenuItem>
                  <MenuItem icon={ArrowRightLeft} onClick={() => { setActionsOpen(false); setTransferOpen(true); }}>
                    Transfer to agent…
                  </MenuItem>
                  <MenuItem icon={TicketPlus} onClick={() => { setActionsOpen(false); setTicketOpen(true); }}>
                    Create ticket…
                  </MenuItem>
                  <div className="my-1 border-t border-ink-100" />
                  <MenuItem
                    icon={Clock}
                    onClick={() => act(() => conversationService.update(conversationId, { status: 'waiting_customer' }), 'Waiting for customer')}
                  >
                    Waiting for customer
                  </MenuItem>
                  <MenuItem
                    icon={Clock}
                    onClick={() => act(() => conversationService.update(conversationId, { status: 'waiting_team' }), 'Waiting for team')}
                  >
                    Waiting for team
                  </MenuItem>
                  <div className="my-1 border-t border-ink-100" />
                  {['low', 'normal', 'high', 'urgent'].map((p) => (
                    <MenuItem
                      key={p}
                      onClick={() => act(() => conversationService.update(conversationId, { priority: p }), `Priority set to ${p}`)}
                    >
                      Priority: {p}
                    </MenuItem>
                  ))}
                  <div className="my-1 border-t border-ink-100" />
                  {resolved ? (
                    <MenuItem icon={RotateCcw} onClick={() => act(() => conversationService.reopen(conversationId), 'Conversation reopened')}>
                      Reopen
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon={XCircle}
                      onClick={() => act(() => conversationService.update(conversationId, { status: 'closed' }), 'Conversation closed')}
                    >
                      Close
                    </MenuItem>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={onToggleDetails}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 xl:hidden"
            aria-label="Toggle customer details"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* AI handoff summary — the thing that stops customers repeating themselves */}
      {conversation.aiSummary && (
        <div className="border-b border-brand-100 bg-brand-50/60 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                AI summary
                {conversation.aiSuggestedTeam && ` · suggested: ${conversation.aiSuggestedTeam}`}
              </p>
              <p className="mt-0.5 text-sm text-ink-700">{conversation.aiSummary}</p>
            </div>
            <button
              onClick={() => act(() => conversationService.summarize(conversationId), 'Summary regenerated')}
              className="shrink-0 text-[11px] font-medium text-brand-600 hover:text-brand-700"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      {/* Thread */}
      <div className="flex-1 space-y-4 overflow-y-auto scroll-thin p-4">
        {messages.map((m) => (
          <AgentMessage
            key={m.clientMessageId || m._id}
            message={m}
            customerName={customer?.name || customer?.email || 'Customer'}
            onRetry={retry}
          />
        ))}
        {customerTyping && <p className="text-xs italic text-ink-500">Customer is typing…</p>}
        <div ref={bottomRef} />
      </div>

      {/* Suggested reply — always requires an explicit Send */}
      {suggestion?.available && (
        <div className="border-t border-brand-200 bg-brand-50 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Suggested reply</p>
            {suggestion.sources?.length > 0 && (
              <span className="text-[11px] text-brand-600">· from {suggestion.sources.map((s) => s.title).join(', ')}</span>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-800">{suggestion.reply}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                setText(suggestion.reply);
                setSuggestion(null);
              }}
            >
              Edit &amp; send
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                // Same optimistic path as a typed message — the agent explicitly
                // chose to send, so nothing here is auto-sent.
                const optimistic = createOptimisticMessage({
                  conversationId,
                  senderType: 'agent',
                  senderId: user?._id,
                  senderName: user?.name || 'You',
                  content: suggestion.reply,
                });
                onApplyMessage?.(optimistic);
                setSuggestion(null);
                deliver(optimistic).catch((err) =>
                  onFailMessage?.(optimistic.clientMessageId, err.friendlyMessage || err.message)
                );
              }}
            >
              Send as is
            </Button>
            <Button size="sm" variant="ghost" onClick={getSuggestion} loading={suggesting}>
              Regenerate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Ignore
            </Button>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-ink-200 bg-white">
        <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-1.5">
          <button
            onClick={() => setInternal(false)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              !internal ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-700'
            )}
          >
            Reply to customer
          </button>
          <button
            onClick={() => setInternal(true)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              internal ? 'bg-amber-100 text-amber-800' : 'text-ink-500 hover:text-ink-700'
            )}
          >
            <Lock className="h-3 w-3" /> Internal note
          </button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={getSuggestion} loading={suggesting}>
            <Sparkles className="h-3.5 w-3.5" /> Suggest reply
          </Button>
        </div>

        {resolved && (
          <Alert tone="info" className="m-3">
            This conversation is {conversation.status}. Sending a message will not reopen it automatically — use Actions → Reopen.
          </Alert>
        )}

        <form onSubmit={send} className="flex items-end gap-2 p-3">
          <input ref={fileRef} type="file" className="hidden" onChange={attach} accept="image/*,.pdf,.txt,.zip,.csv,.json" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={onChangeText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={internal ? 'Write an internal note (the customer will not see this)…' : 'Type your reply…'}
            className={cn(
              'max-h-40 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2',
              internal
                ? 'border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-400/20'
                : 'border-ink-300 focus:border-brand-500 focus:ring-brand-500/20'
            )}
          />
          {/* Never disabled while a previous message is in flight — the bubble
              is already on screen, so the agent can keep typing and sending. */}
          <button
            type="submit"
            disabled={!text.trim()}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
              text.trim() ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-ink-200 text-ink-400'
            )}
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>

      {/* Transfer */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer conversation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!transferTo}
              onClick={() =>
                act(async () => {
                  await conversationService.transfer(conversationId, transferTo, transferNote);
                  setTransferOpen(false);
                  setTransferTo('');
                  setTransferNote('');
                }, 'Conversation transferred')
              }
            >
              Transfer
            </Button>
          </>
        }
      >
        <Select label="Transfer to" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
          <option value="">Choose an agent…</option>
          {(agents || []).map((a) => (
            <option key={a._id} value={a._id}>
              {a.name} — {humanize(a.role)} {a.isOnline ? '(online)' : ''}
            </option>
          ))}
        </Select>
        <Textarea
          className="mt-3"
          label="Handover note (optional)"
          value={transferNote}
          onChange={(e) => setTransferNote(e.target.value)}
          placeholder="Anything the next agent should know…"
        />
      </Modal>

      {/* Create ticket */}
      <Modal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        title="Create ticket"
        description="Use a ticket when this needs investigation beyond the live chat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTicketOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTicket} disabled={!ticketForm.title.trim()}>
              Create ticket
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="ticket-title">Title</label>
            <input
              id="ticket-title"
              className="input"
              value={ticketForm.title}
              onChange={(e) => setTicketForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Short summary of the problem"
            />
          </div>
          <Textarea
            label="Description"
            value={ticketForm.description}
            onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={conversation.aiSummary || 'What needs investigating?'}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Category"
              value={ticketForm.category}
              onChange={(e) => setTicketForm((f) => ({ ...f, category: e.target.value }))}
            >
              {['Technical', 'Billing', 'Refund', 'Account', 'Bug', 'Feature Request', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select
              label="Priority"
              value={ticketForm.priority}
              onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-700 hover:bg-ink-50"
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-ink-400" />}
      {children}
    </button>
  );
}
