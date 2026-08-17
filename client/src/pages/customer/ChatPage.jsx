import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, CheckCircle2, Loader2, UserRound, RotateCcw } from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import ChatMessage from '../../components/support/ChatMessage';
import Composer from '../../components/support/Composer';
import ImmersiveShell, { AssistantAvatar } from '../../components/support/ImmersiveShell';
import { Button, Input, Modal } from '../../components/ui';
import { toMessage } from '../../services/api';
import { resolveSupportTheme, assistantNameFor } from '../../utils/supportTheme';

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
    // `otherOpen` is deliberately not read: the cross-mode notice is gone from
    // this screen. The context still tracks it for anything else that needs it.
    product, productSlug, messages, conversation, aiThinking, agentTyping, loadedMode,
    sendMessage, retryMessage, requestHuman, sendFeedback, identify, uploadFile, emitTyping, customer,
    reloadConversation,
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

  const theme = resolveSupportTheme(product);
  const assistantName = assistantNameFor(product, theme);
  // The greeting names the screen rather than opening the thread — the real
  // first reply still arrives as a message like any other.
  const tagline = product.aiWelcomeMessage?.trim() || `How can I help you today?`;

  // Two controls only, as sparse as the reference: start over, and leave.
  const shellActions = [
    { label: 'Reload this conversation', icon: RotateCcw, onClick: () => reloadConversation() },
  ];

  return (
    <ImmersiveShell
      product={product}
      theme={theme}
      framed
      actions={shellActions}
      onClose={() => navigate(`/support/${productSlug}`)}
    >
      {/* Thread — the identity sits at its head and scrolls away with it. */}
      <div className="scroll-ghost min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto w-full max-w-3xl pb-6">
          {/* Assistant identity */}
          <div className="flex flex-col items-center pb-8 pt-10 text-center">
            <AssistantAvatar
              product={product}
              theme={theme}
              online={!isHuman || Boolean(conversation?.agent?.isOnline)}
            />

            <h1 className="mt-5 font-script text-4xl font-bold leading-none text-white sm:text-5xl">
              {assistantName}
            </h1>
            <p className="mt-3 text-base font-semibold text-white/90 sm:text-lg">{tagline}</p>

            {/* Said only when it carries news: who is with you, or that we are done. */}
            {isHuman && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/45">
                {conversation?.agent ? (
                  `${conversation.agent.name} is with you`
                ) : (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for an available agent…
                  </>
                )}
              </p>
            )}
            {resolved && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Resolved
              </p>
            )}
          </div>

          <div className="space-y-3.5">
            {messages.length === 0 && (
              <div className="flex flex-wrap justify-center gap-2 pb-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5
                               text-xs font-medium text-white/70 backdrop-blur transition-colors hover:bg-white/[0.12] hover:text-white"
                  >
                    <Sparkles className="h-3 w-3" style={{ color: theme.accentFrom }} />
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
                minimal
                // Only a name the product actually chose overrides the bubble's
                // "<Product> Assistant" label.
                assistantName={theme.assistantName}
                theme="dark"
                onVideoClick={openVideo}
                onRecommendationClick={openRecommendation}
                onTalkToSupport={() => escalate('AI could not answer the question')}
                onFeedback={onFeedback}
                onRetry={retryMessage}
                showFeedback={i === lastAiIndex && !isHuman && !resolved && !feedbackGiven}
              />
            ))}

            {aiThinking && (
              <div className="flex">
                <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.09] px-4 py-3 backdrop-blur-sm">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {agentTyping && <p className="text-xs italic text-white/45">Support agent is typing…</p>}

            {resolved && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-center">
                <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-emerald-300" />
                <p className="text-sm font-medium text-emerald-100">This conversation is resolved</p>
                <p className="mt-0.5 text-xs text-emerald-200/70">
                  Send another message any time and we will pick it back up.
                </p>
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        variant="immersive"
        onSend={handleSend}
        onUpload={uploadFile}
        onTyping={emitTyping}
        busy={sending}
        placeholder={isHuman ? 'Message the support team…' : topicPrefill || 'Type your reply…'}
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
    </ImmersiveShell>
  );
}
