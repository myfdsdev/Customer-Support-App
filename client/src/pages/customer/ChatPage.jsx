import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Headphones, Sparkles, CheckCircle2, Loader2, UserRound } from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import ChatMessage from '../../components/support/ChatMessage';
import Composer from '../../components/support/Composer';
import { Button, Input, Modal, Badge, PresenceDot } from '../../components/ui';
import { toMessage } from '../../services/api';

const TOPIC_PROMPTS = {
  billing: 'I have a question about billing',
  problem: 'I want to report a problem: ',
};

/**
 * One continuous conversation. `/chat` and `/live-support` render the same
 * thread — asking for a human changes who answers, never which conversation
 * the customer is in.
 */
export default function ChatPage({ initialMode = 'ai' }) {
  const {
    product, productSlug, messages, conversation, aiThinking, agentTyping, otherOpen, loadedMode,
    sendMessage, retryMessage, requestHuman, sendFeedback, identify, uploadFile, emitTyping, customer,
  } = useSupport();

  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [askIdentity, setAskIdentity] = useState(false);
  const [identityForm, setIdentityForm] = useState({ name: '', email: '' });
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const bottomRef = useRef(null);
  const prefilled = useRef(false);

  const isHuman = conversation?.channel === 'human';
  const resolved = conversation?.status === 'resolved' || conversation?.status === 'closed';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, aiThinking, agentTyping]);

  // /live-support means "I want a person" — start the handoff on arrival.
  // Gated on loadedMode so we act on the human-mode thread, not on an AI
  // conversation still in state from the route we just left.
  useEffect(() => {
    if (initialMode !== 'human' || prefilled.current) return;
    if (loadedMode !== 'human') return;
    if (!conversation || conversation.channel === 'human') return;
    prefilled.current = true;
    escalate('Customer opened live support');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, loadedMode, conversation?._id, conversation?.channel]);

  const starters = useMemo(() => {
    const topic = params.get('topic');
    if (topic === 'billing') {
      return ['Where can I find my invoices?', 'How do credits work?', 'How do I change my plan?'];
    }
    if (topic === 'problem') {
      return ['Something is not working', 'I am getting an error', 'A feature stopped responding'];
    }
    return ['How do I get started?', 'How do credits work?', 'How do I export my work?'];
  }, [params]);

  const topicPrefill = TOPIC_PROMPTS[params.get('topic')] || '';

  /**
   * The bubble is rendered optimistically inside sendMessage, so this never
   * blocks the composer. A failure surfaces on the bubble itself with a Retry,
   * which is why nothing is re-thrown into the composer here.
   */
  async function handleSend(text) {
    setFeedbackGiven(false);
    try {
      await sendMessage(text);
    } catch {
      /* the failed bubble carries the error and the retry action */
    }
  }

  async function escalate(reason) {
    if (escalating) return;
    setEscalating(true);
    try {
      await requestHuman(reason || 'Customer requested human support');
      // Ask for contact details only at the moment they become useful.
      if (!customer?.email && !customer?.name) setAskIdentity(true);
      toast.success('Connecting you with our support team');
      // Move to the live-support route so the URL matches who they are now
      // talking to, and so a refresh resumes the human thread rather than
      // opening a fresh AI one.
      if (initialMode !== 'human') {
        navigate(`/support/${productSlug}/live-support`, { replace: true });
      }
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setEscalating(false);
    }
  }

  async function submitIdentity(e) {
    e.preventDefault();
    try {
      await identify(identityForm);
      setAskIdentity(false);
      toast.success('Thanks — our team can now follow up with you.');
    } catch (err) {
      toast.error(toMessage(err));
    }
  }

  async function onFeedback(helpful) {
    setFeedbackGiven(true);
    if (!helpful) {
      await escalate('AI answer did not resolve the issue');
      return;
    }
    try {
      await sendFeedback(true);
      toast.success('Glad that helped.');
    } catch (err) {
      toast.error(toMessage(err));
    }
  }

  const openVideo = (video) => {
    if (video.videoId) supportService.videoClick(productSlug, video.videoId).catch(() => null);
    window.open(video.videoUrl, '_blank', 'noopener');
  };

  const openRecommendation = (rec) => {
    if (rec.recommendationId) supportService.recommendationClick(productSlug, rec.recommendationId).catch(() => null);
    if (rec.ctaUrl?.startsWith('/')) navigate(rec.ctaUrl);
    else if (rec.ctaUrl) window.open(rec.ctaUrl, '_blank', 'noopener');
  };

  // Only the newest AI answer offers the "did this solve it?" prompt.
  const lastAiIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].senderType === 'ai') return i;
    return -1;
  })();

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] max-w-3xl flex-col sm:h-[calc(100vh-9.5rem)]">
      {/* Conversation header */}
      <div className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          {isHuman ? <Headphones className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">
            {isHuman ? 'Support team' : `${product.name} Assistant`}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            {isHuman ? (
              conversation?.agent ? (
                <>
                  <PresenceDot status={conversation.agent.isOnline ? 'online' : 'offline'} />
                  {conversation.agent.name} is with you
                </>
              ) : (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for an available agent…
                </>
              )
            ) : (
              'Answers come from verified product documentation'
            )}
          </p>
        </div>

        {resolved ? (
          <Badge tone="green" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </Badge>
        ) : !isHuman ? (
          <Button variant="secondary" size="sm" onClick={() => escalate()} loading={escalating}>
            <Headphones className="h-4 w-4" />
            <span className="hidden sm:inline">Talk to Support</span>
          </Button>
        ) : null}
      </div>

      {/* A chat open in the other mode — say so plainly rather than leaving the
          customer wondering where their conversation went. */}
      {otherOpen && (
        <div className="flex items-center gap-2 border-b border-ink-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <Headphones className="h-3.5 w-3.5 shrink-0" />
          {otherOpen.channel === 'human' ? (
            <>
              <span className="min-w-0 flex-1">You also have a chat open with the support team.</span>
              <button
                onClick={() => navigate(`/support/${productSlug}/live-support`)}
                className="shrink-0 font-semibold underline hover:text-amber-950"
              >
                Go to it
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1">You have an earlier conversation with the AI assistant.</span>
              <button
                onClick={() => navigate(`/support/${productSlug}/chat`)}
                className="shrink-0 font-semibold underline hover:text-amber-950"
              >
                Go to it
              </button>
            </>
          )}
        </div>
      )}

      {/* Thread */}
      <div className="flex-1 space-y-4 overflow-y-auto scroll-thin bg-ink-50 p-4">
        {/* Welcome */}
        <div className="flex gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <Bot className="h-4 w-4" />
          </div>
          <div className="max-w-[85%]">
            <p className="mb-1 text-xs font-medium text-ink-500">{product.name} Assistant</p>
            <div className="rounded-2xl rounded-bl-md border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800">
              {product.aiWelcomeMessage}
            </div>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="ml-11 flex flex-wrap gap-2">
            {starters.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <Sparkles className="h-3 w-3 text-brand-500" />
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessage
            key={m.clientMessageId || m._id}
            message={m}
            product={product}
            onVideoClick={openVideo}
            onRecommendationClick={openRecommendation}
            onTalkToSupport={() => escalate('AI could not answer the question')}
            onFeedback={onFeedback}
            onRetry={retryMessage}
            showFeedback={i === lastAiIndex && !isHuman && !resolved && !feedbackGiven}
          />
        ))}

        {aiThinking && (
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-ink-200 bg-white px-4 py-3">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {agentTyping && (
          <p className="ml-11 text-xs italic text-ink-500">Support agent is typing…</p>
        )}

        {resolved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-900">This conversation is resolved</p>
            <p className="mt-0.5 text-xs text-emerald-700">Send another message any time and we will pick it back up.</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <Composer
        onSend={handleSend}
        onUpload={uploadFile}
        onTyping={emitTyping}
        busy={sending}
        placeholder={
          isHuman ? 'Message the support team…' : topicPrefill || `Ask anything about ${product.name}…`
        }
      />

      <Modal
        open={askIdentity}
        onClose={() => setAskIdentity(false)}
        title="How can we reach you?"
        description="Optional, but it lets our team follow up if you close this page."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAskIdentity(false)}>
              Skip
            </Button>
            <Button onClick={submitIdentity}>Save</Button>
          </>
        }
      >
        <form onSubmit={submitIdentity} className="space-y-3">
          <Input
            label="Name"
            name="name"
            value={identityForm.name}
            onChange={(e) => setIdentityForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Your name"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={identityForm.email}
            onChange={(e) => setIdentityForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
          <p className="flex items-start gap-1.5 text-xs text-ink-500">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            We only use this to continue this support conversation.
          </p>
        </form>
      </Modal>
    </div>
  );
}
