import React from 'react';
import { Bot, User, Info, PlayCircle, FileText, ArrowRight, AlertTriangle, Paperclip, RotateCw } from 'lucide-react';
import cn from '../../utils/cn';
import { clockTime, videoDuration, renderInline, fileSize } from '../../utils/format';
import { Avatar } from '../ui';

/**
 * One turn in the customer's conversation.
 *
 * AI turns can carry a step list, a training video and (rarely) a product
 * suggestion. Anything the AI could not ground shows the escalation prompt
 * instead of a confident-looking answer.
 */
export default function ChatMessage({
  message,
  product,
  onVideoClick,
  onRecommendationClick,
  onTalkToSupport,
  onFeedback,
  onRetry,
  showFeedback,
}) {
  const { senderType, content, ai, attachmentUrl, messageType } = message;

  if (senderType === 'system') {
    // Handoff briefs are staff-facing; customers see a one-line notice.
    const text = messageType === 'handoff' ? 'Transferred to the support team' : content;
    return (
      <div className="my-3 flex items-center gap-2 text-center">
        <div className="h-px flex-1 bg-ink-200" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">
          <Info className="h-3 w-3" />
          {text}
        </span>
        <div className="h-px flex-1 bg-ink-200" />
      </div>
    );
  }

  const isCustomer = senderType === 'customer';
  const isAI = senderType === 'ai';
  const unanswered = isAI && ai && ai.answered === false;

  return (
    <div className={cn('flex gap-2.5', isCustomer ? 'flex-row-reverse' : 'flex-row')}>
      {!isCustomer && (
        <div className="mt-0.5 shrink-0">
          {isAI ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <Bot className="h-4 w-4" />
            </div>
          ) : (
            <Avatar name={message.senderName} size="sm" />
          )}
        </div>
      )}

      <div className={cn('min-w-0 max-w-[85%] sm:max-w-[75%]', isCustomer && 'flex flex-col items-end')}>
        {!isCustomer && (
          <p className="mb-1 text-xs font-medium text-ink-500">
            {isAI ? `${product?.name || 'Support'} Assistant` : message.senderName || 'Support agent'}
          </p>
        )}

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            isCustomer
              ? 'rounded-br-md bg-brand-600 text-white'
              : unanswered
                ? 'rounded-bl-md border border-amber-200 bg-amber-50 text-amber-900'
                : 'rounded-bl-md border border-ink-200 bg-white text-ink-800',
            message.failed && 'opacity-60 ring-1 ring-red-300'
          )}
        >
          {attachmentUrl && messageType === 'image' ? (
            <a href={attachmentUrl} target="_blank" rel="noreferrer" className="block">
              <img src={attachmentUrl} alt={message.attachmentName || 'Attachment'} className="mb-1 max-h-64 rounded-lg" />
            </a>
          ) : null}

          {attachmentUrl && messageType === 'file' ? (
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'mb-1 flex items-center gap-2 rounded-lg border p-2 text-xs',
                isCustomer ? 'border-white/30 text-white' : 'border-ink-200 text-ink-700'
              )}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate">{message.attachmentName}</span>
              <span className="opacity-70">{fileSize(message.attachmentSize)}</span>
            </a>
          ) : null}

          {content && (
            <div
              className="prose-chat break-words"
              // Model output is HTML-escaped in renderInline before any markup
              // is re-introduced, so this cannot inject elements.
              dangerouslySetInnerHTML={{ __html: renderInline(content) }}
            />
          )}

          {ai?.steps?.length > 0 && (
            <ol className="mt-2.5 space-y-1.5 border-t border-ink-200/70 pt-2.5">
              {ai.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: renderInline(step) }} />
                </li>
              ))}
            </ol>
          )}
        </div>

        {message.failed && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3 w-3" /> {message.error || 'Message failed to send'}
            {onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="inline-flex items-center gap-0.5 font-medium underline hover:text-red-700"
              >
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            )}
          </p>
        )}

        {/* Training video recommendation */}
        {ai?.video?.videoId && (
          <button
            onClick={() => onVideoClick?.(ai.video)}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
          >
            {ai.video.thumbnailUrl ? (
              <img src={ai.video.thumbnailUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-ink-100">
                <PlayCircle className="h-5 w-5 text-ink-400" />
              </div>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-600">Watch training</span>
              <span className="block truncate text-sm font-medium text-ink-800">{ai.video.title}</span>
              {ai.video.duration > 0 && <span className="text-xs text-ink-500">{videoDuration(ai.video.duration)}</span>}
            </span>
            <PlayCircle className="h-5 w-5 shrink-0 text-brand-600" />
          </button>
        )}

        {/* Escalation offer whenever the AI could not verify an answer */}
        {unanswered && (
          <button onClick={onTalkToSupport} className="btn-primary mt-2 w-full sm:w-auto">
            Talk to Support
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {/* "Did this solve your issue?" */}
        {showFeedback && isAI && ai?.answered && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
            <span className="text-xs text-ink-600">Did this solve your issue?</span>
            <button onClick={() => onFeedback?.(true)} className="btn-secondary !py-1 !text-xs">
              Yes
            </button>
            <button onClick={() => onFeedback?.(false)} className="btn-secondary !py-1 !text-xs">
              Talk to Support
            </button>
          </div>
        )}

        {/* Subtle, gated cross-product suggestion */}
        {ai?.recommendation?.title && (
          <div className="mt-2 rounded-xl border border-dashed border-ink-300 bg-white p-3">
            <p className="text-sm font-medium text-ink-800">{ai.recommendation.title}</p>
            {ai.recommendation.description && <p className="mt-0.5 text-xs text-ink-500">{ai.recommendation.description}</p>}
            <button
              onClick={() => onRecommendationClick?.(ai.recommendation)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {ai.recommendation.ctaText || 'Learn more'} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Provenance: which articles the answer came from */}
        {ai?.sources?.length > 0 && (
          <details className="mt-1.5 text-xs text-ink-400">
            <summary className="cursor-pointer select-none hover:text-ink-600">
              Based on {ai.sources.length} help {ai.sources.length === 1 ? 'article' : 'articles'}
            </summary>
            <ul className="mt-1 space-y-0.5">
              {ai.sources.map((s, i) => (
                <li key={i} className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {s.title}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className={cn('mt-1 text-[11px] text-ink-400', isCustomer && 'text-right')}>
          {message.pending ? 'Sending…' : clockTime(message.createdAt)}
          {isCustomer && message.readAt && ' · Read'}
        </p>
      </div>

      {isCustomer && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-ink-600">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
