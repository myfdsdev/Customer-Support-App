import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Users, Wifi, WifiOff } from 'lucide-react';
import cn from '../../utils/cn';
import { Spinner, ErrorState, ProductLogo, PresenceDot } from '../../components/ui';
import ChatMessage from '../../components/support/ChatMessage';
import Composer from '../../components/support/Composer';
import { usePortalChat } from '../../components/portal/usePortalChat';

const AI_STARTERS = [
  'How do I get started?',
  'What are the main features?',
  'I’m having trouble logging in',
  'How does billing work?',
];

/**
 * Full-page chat. `mode` is fixed by the route: 'ai' → the assistant page,
 * 'human' → the team page. Both drive the same underlying support session and
 * conversation, so nothing leaks between them and the team thread lands in the
 * existing Admin Inbox untouched.
 */
export default function PortalChat({ mode = 'ai' }) {
  const { productSlug } = useParams();
  const location = useLocation();
  const intake = location.state || null;
  const scrollRef = useRef(null);

  const chat = usePortalChat({ slug: productSlug, mode, intake });
  const { messages, aiThinking, agentTyping, connected, conversation } = chat;

  const isTeam = mode === 'human';

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiThinking, agentTyping]);

  const product = useMemo(
    () => ({ name: productSlug, slug: productSlug }),
    [productSlug]
  );

  if (chat.error) {
    return (
      <div className="py-12">
        <ErrorState message={chat.error} onRetry={chat.reload} />
        <div className="mt-4 text-center">
          <Link to="/portal/support" className="text-sm text-brand-700 hover:underline">
            Back to Support
          </Link>
        </div>
      </div>
    );
  }

  if (!chat.ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label={isTeam ? 'Connecting you to the team…' : 'Starting the assistant…'} />
      </div>
    );
  }

  const agent = conversation?.agent;
  const statusLabel = isTeam
    ? conversation?.status === 'active' && agent
      ? `${agent.name} is helping you`
      : conversation?.status === 'resolved'
        ? 'Resolved'
        : agent
          ? `Assigned to ${agent.name}`
          : 'Waiting for the next available agent'
    : 'AI Assistant';

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/portal/support" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Back to Support">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', isTeam ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700')}>
            {isTeam ? <Users className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{isTeam ? 'Chat with Our Team' : 'AI Assistant'}</p>
            <p className="truncate text-xs text-ink-500">{statusLabel}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-1 text-xs text-ink-400 sm:flex">
            {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
            {connected ? 'Connected' : 'Reconnecting…'}
          </span>
          {isTeam ? (
            <Link to={`/portal/support/${productSlug}/ai`} className="btn-secondary hidden sm:inline-flex">
              <Bot className="h-4 w-4" /> Ask AI instead
            </Link>
          ) : (
            <Link
              to={`/portal/support/${productSlug}/team`}
              onClick={() => chat.switchToTeam()}
              className="btn-secondary hidden sm:inline-flex"
            >
              <Users className="h-4 w-4" /> Chat with Our Team
            </Link>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto scroll-thin py-4">
        {messages.length === 0 && !aiThinking ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className={cn('mb-3 grid h-14 w-14 place-items-center rounded-2xl', isTeam ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700')}>
              {isTeam ? <Users className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
            </span>
            <p className="font-medium text-ink-900">
              {isTeam ? 'Start a conversation with our team' : 'Ask the assistant anything'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-ink-500">
              {isTeam
                ? 'Describe your issue and we’ll connect you with a support specialist.'
                : 'I can help with setup, features, billing and troubleshooting for this product.'}
            </p>
            {!isTeam && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {AI_STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => chat.sendMessage(q)}
                    className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-600 hover:border-brand-400 hover:bg-brand-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.clientMessageId || m._id}
              message={m}
              product={product}
              onRetry={() => chat.retryMessage(m.clientMessageId)}
              assistantName={isTeam ? 'Support Team' : 'AI Assistant'}
            />
          ))
        )}

        {aiThinking && (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-ink-400">
            <Bot className="h-4 w-4" />
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-300" />
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-300" style={{ animationDelay: '0.2s' }} />
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-300" style={{ animationDelay: '0.4s' }} />
            </span>
          </div>
        )}
        {agentTyping && (
          <div className="px-2 py-1 text-xs text-ink-400">Support is typing…</div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-ink-200 pt-3">
        <Composer
          onSend={chat.sendMessage}
          onUpload={(file) => chat.uploadFile(file)}
          onTyping={chat.emitTyping}
          placeholder={isTeam ? 'Message the team…' : 'Ask the assistant…'}
        />
      </div>
    </div>
  );
}
