import React from 'react';
import { Bot, Info, Lock, Paperclip, FileText, PlayCircle, AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import cn from '../../utils/cn';
import { clockTime, fileSize, renderInline } from '../../utils/format';
import { Avatar, Badge } from '../ui';

/**
 * Agent-side rendering of a message.
 *
 * Differences from the customer view: internal notes are visible, handoff
 * briefs are shown in full, and AI turns expose their grounding so an agent
 * can tell at a glance whether the assistant actually knew the answer.
 */
export default function AgentMessage({ message, customerName, onRetry }) {
  const { senderType, content, ai, isInternal, messageType, attachmentUrl } = message;

  if (isInternal) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <Lock className="h-3 w-3" /> Internal note · {message.senderName}
          </p>
          <p className="whitespace-pre-wrap text-sm text-amber-900">{content}</p>
          <p className="mt-1 text-right text-[11px] text-amber-600">{clockTime(message.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (senderType === 'system') {
    const isHandoff = messageType === 'handoff';
    return (
      <div className={cn('rounded-xl border px-3.5 py-2.5', isHandoff ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-ink-50')}>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <Info className="h-3 w-3" /> {isHandoff ? 'Handoff brief' : 'System'}
        </p>
        <p className="whitespace-pre-wrap text-sm text-ink-700">{content}</p>
        <p className="mt-1 text-[11px] text-ink-400">{clockTime(message.createdAt)}</p>
      </div>
    );
  }

  const isCustomer = senderType === 'customer';
  const isAI = senderType === 'ai';
  // `answered` is null on AI messages that were never answer attempts (the
  // handoff notice, for example) — those must not show a grounding score.
  const isAnswerAttempt = isAI && ai && ai.answered !== null && ai.answered !== undefined;
  const unanswered = isAnswerAttempt && ai.answered === false;

  return (
    <div className={cn('flex gap-2.5', isCustomer ? 'flex-row' : 'flex-row-reverse')}>
      <div className="mt-0.5 shrink-0">
        {isAI ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <Bot className="h-4 w-4" />
          </div>
        ) : (
          <Avatar name={isCustomer ? customerName : message.senderName} size="sm" />
        )}
      </div>

      <div className={cn('min-w-0 max-w-[78%]', !isCustomer && 'flex flex-col items-end')}>
        <p className="mb-1 text-xs font-medium text-ink-500">
          {isCustomer ? customerName || 'Customer' : isAI ? 'AI Assistant' : message.senderName}
        </p>

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isCustomer
              ? 'rounded-bl-md border border-ink-200 bg-white text-ink-800'
              : unanswered
                ? 'rounded-br-md border border-amber-200 bg-amber-50 text-amber-900'
                : isAI
                  ? 'rounded-br-md border border-brand-200 bg-brand-50 text-ink-800'
                  : 'rounded-br-md bg-brand-600 text-white',
            message.failed && 'opacity-60'
          )}
        >
          {attachmentUrl && messageType === 'image' && (
            <a href={attachmentUrl} target="_blank" rel="noreferrer">
              <img src={attachmentUrl} alt={message.attachmentName || ''} className="mb-1 max-h-56 rounded-lg" />
            </a>
          )}
          {attachmentUrl && messageType === 'file' && (
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-1 flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate">{message.attachmentName}</span>
              <span className="opacity-70">{fileSize(message.attachmentSize)}</span>
            </a>
          )}

          {content && <div className="prose-chat break-words" dangerouslySetInnerHTML={{ __html: renderInline(content) }} />}

          {ai?.steps?.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
              {ai.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>

        {isAnswerAttempt && (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
            {unanswered ? (
              <Badge tone="amber" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Not grounded — escalated
              </Badge>
            ) : (
              <Badge tone="green">Grounded · {Math.round((ai.confidence || 0) * 100)}%</Badge>
            )}
            {ai.intent && <Badge tone="gray">{ai.intent}</Badge>}
            {ai.video?.title && (
              <Badge tone="indigo" className="gap-1">
                <PlayCircle className="h-3 w-3" /> {ai.video.title}
              </Badge>
            )}
            {ai.sources?.map((s, i) => (
              <Badge key={i} tone="blue" className="gap-1">
                <FileText className="h-3 w-3" /> {s.title}
              </Badge>
            ))}
          </div>
        )}

        {/* Delivery state: sending → sent → read, or failed with a retry. */}
        <p className={cn('mt-1 flex items-center gap-1 text-[11px] text-ink-400', !isCustomer && 'justify-end')}>
          {clockTime(message.createdAt)}
          {!isCustomer && message.pending && (
            <>
              · <Loader2 className="h-3 w-3 animate-spin" /> Sending
            </>
          )}
          {!isCustomer && !message.pending && !message.failed && (message.readAt ? ' · Read' : ' · Sent')}
          {message.failed && (
            <span className="flex items-center gap-1 text-red-600">
              · <AlertTriangle className="h-3 w-3" /> {message.error || 'Failed'}
              {onRetry && (
                <button
                  onClick={() => onRetry(message)}
                  className="ml-0.5 inline-flex items-center gap-0.5 font-medium underline hover:text-red-700"
                >
                  <RotateCw className="h-3 w-3" /> Retry
                </button>
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
