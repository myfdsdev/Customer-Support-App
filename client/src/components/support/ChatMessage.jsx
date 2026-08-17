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
 *
 * `theme` only swaps the palette: 'dark' is the immersive support stage, where
 * the same turn has to read on deep navy instead of on white.
 *
 * `minimal` drops the scaffolding around a turn — avatar, sender name and
 * timestamp — leaving just the bubble. The immersive chat names the assistant
 * once at the top of the screen, so repeating it on every reply is noise.
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
  theme = 'light',
  assistantName,
  minimal = false,
}) {
  const { senderType, content, ai, attachmentUrl, messageType } = message;
  const dark = theme === 'dark';

  if (senderType === 'system') {
    // Handoff briefs are staff-facing; customers see a one-line notice.
    const text = messageType === 'handoff' ? 'Transferred to the support team' : content;
    return (
      <div className="my-3 flex items-center gap-2 text-center">
        <div className={cn('h-px flex-1', dark ? 'bg-white/10' : 'bg-ink-200')} />
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs',
            dark ? 'bg-white/10 text-white/65' : 'bg-ink-100 text-ink-600'
          )}
        >
          <Info className="h-3 w-3" />
          {text}
        </span>
        <div className={cn('h-px flex-1', dark ? 'bg-white/10' : 'bg-ink-200')} />
      </div>
    );
  }

  const isCustomer = senderType === 'customer';
  const isAI = senderType === 'ai';
  const unanswered = isAI && ai && ai.answered === false;

  const surface = dark ? 'border border-white/10 bg-white/[0.06]' : 'border border-ink-200 bg-white';
  const mutedText = dark ? 'text-white/50' : 'text-ink-500';

  return (
    <div className={cn('flex gap-2.5', isCustomer ? 'flex-row-reverse' : 'flex-row')}>
      {!isCustomer && !minimal && (
        <div className="mt-0.5 shrink-0">
          {isAI ? (
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                dark ? 'bg-white/10 text-cyan-200' : 'bg-brand-100 text-brand-700'
              )}
            >
              <Bot className="h-4 w-4" />
            </div>
          ) : (
            <Avatar name={message.senderName} size="sm" />
          )}
        </div>
      )}

      <div className={cn('min-w-0 max-w-[85%] sm:max-w-[75%]', isCustomer && 'flex flex-col items-end')}>
        {!isCustomer && !minimal && (
          <p className={cn('mb-1 text-xs font-medium', mutedText)}>
            {isAI
              ? assistantName || `${product?.name || 'Support'} Assistant`
              : message.senderName || 'Support agent'}
          </p>
        )}

        <div
          className={cn(
            'text-sm leading-relaxed',
            minimal ? 'rounded-2xl px-4 py-2.5 shadow-lg shadow-black/20' : 'rounded-2xl px-3.5 py-2.5',
            isCustomer
              ? minimal
                ? 'bg-white font-medium text-slate-900'
                : dark
                  ? 'rounded-br-md border border-cyan-300/25 bg-cyan-400/[0.14] text-white'
                  : 'rounded-br-md bg-brand-600 text-ink-900'
              : unanswered
                ? minimal
                  ? 'border border-amber-300/25 bg-amber-400/10 text-amber-100'
                  : dark
                    ? 'rounded-bl-md border border-amber-300/30 bg-amber-400/10 text-amber-100'
                    : 'rounded-bl-md border border-amber-200 bg-amber-50 text-amber-900'
                : minimal
                  ? 'border border-white/10 bg-white/[0.09] text-white backdrop-blur-sm'
                  : dark
                    ? 'rounded-bl-md border border-white/10 bg-white/[0.06] text-white/90'
                    : 'rounded-bl-md border border-ink-200 bg-white text-ink-800',
            message.failed && (dark ? 'opacity-60 ring-1 ring-red-400/50' : 'opacity-60 ring-1 ring-red-300')
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
                dark
                  ? 'border-white/15 text-white/80'
                  : isCustomer
                    ? 'border-ink-900/20 text-ink-900'
                    : 'border-ink-200 text-ink-700'
              )}
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="truncate">{message.attachmentName}</span>
              <span className="opacity-70">{fileSize(message.attachmentSize)}</span>
            </a>
          ) : null}

          {content && (
            <div
              className={cn('prose-chat break-words', dark && 'prose-chat-dark')}
              // Model output is HTML-escaped in renderInline before any markup
              // is re-introduced, so this cannot inject elements.
              dangerouslySetInnerHTML={{ __html: renderInline(content) }}
            />
          )}

          {ai?.steps?.length > 0 && (
            <ol className={cn('mt-2.5 space-y-1.5 border-t pt-2.5', dark ? 'border-white/10' : 'border-ink-200/70')}>
              {ai.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      dark ? 'bg-white/12 text-cyan-200' : 'bg-brand-100 text-brand-700'
                    )}
                  >
                    {i + 1}
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: renderInline(step) }} />
                </li>
              ))}
            </ol>
          )}
        </div>

        {message.failed && (
          <p className={cn('mt-1 flex items-center gap-1.5 text-xs', dark ? 'text-red-300' : 'text-red-600')}>
            <AlertTriangle className="h-3 w-3" /> {message.error || 'Message failed to send'}
            {onRetry && (
              <button
                onClick={() => onRetry(message)}
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium underline',
                  dark ? 'hover:text-red-200' : 'hover:text-red-700'
                )}
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
            className={cn(
              'mt-2 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors',
              dark ? `${surface} hover:bg-white/[0.1]` : 'border border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'
            )}
          >
            {ai.video.thumbnailUrl ? (
              <img src={ai.video.thumbnailUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <div
                className={cn(
                  'flex h-12 w-20 shrink-0 items-center justify-center rounded-lg',
                  dark ? 'bg-white/10' : 'bg-ink-100'
                )}
              >
                <PlayCircle className={cn('h-5 w-5', dark ? 'text-white/50' : 'text-ink-400')} />
              </div>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-[11px] font-semibold uppercase tracking-wide',
                  dark ? 'text-orange-300' : 'text-brand-700'
                )}
              >
                Watch training
              </span>
              <span className={cn('block truncate text-sm font-medium', dark ? 'text-white' : 'text-ink-800')}>
                {ai.video.title}
              </span>
              {ai.video.duration > 0 && (
                <span className={cn('text-xs', mutedText)}>{videoDuration(ai.video.duration)}</span>
              )}
            </span>
            <PlayCircle className={cn('h-5 w-5 shrink-0', dark ? 'text-cyan-200' : 'text-brand-700')} />
          </button>
        )}

        {/* Escalation offer whenever the AI could not verify an answer */}
        {unanswered && (
          <button
            onClick={onTalkToSupport}
            className={cn(
              'mt-2 w-full sm:w-auto',
              dark
                ? 'support-cta inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold'
                : 'btn-primary'
            )}
          >
            Talk to Support
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {/* "Did this solve your issue?" */}
        {showFeedback && isAI && ai?.answered && (
          <div
            className={cn(
              'mt-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2',
              dark ? 'border border-white/10 bg-white/5' : 'border border-ink-200 bg-ink-50'
            )}
          >
            <span className={cn('text-xs', dark ? 'text-white/65' : 'text-ink-600')}>Did this solve your issue?</span>
            <button
              onClick={() => onFeedback?.(true)}
              className={cn(
                dark
                  ? 'rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/85 transition-colors hover:bg-white/10'
                  : 'btn-secondary !py-1 !text-xs'
              )}
            >
              Yes
            </button>
            <button
              onClick={() => onFeedback?.(false)}
              className={cn(
                dark
                  ? 'rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/85 transition-colors hover:bg-white/10'
                  : 'btn-secondary !py-1 !text-xs'
              )}
            >
              Talk to Support
            </button>
          </div>
        )}

        {/* Subtle, gated cross-product suggestion */}
        {ai?.recommendation?.title && (
          <div
            className={cn(
              'mt-2 rounded-xl border border-dashed p-3',
              dark ? 'border-white/20 bg-white/5' : 'border-ink-300 bg-white'
            )}
          >
            <p className={cn('text-sm font-medium', dark ? 'text-white' : 'text-ink-800')}>{ai.recommendation.title}</p>
            {ai.recommendation.description && (
              <p className={cn('mt-0.5 text-xs', mutedText)}>{ai.recommendation.description}</p>
            )}
            <button
              onClick={() => onRecommendationClick?.(ai.recommendation)}
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-xs font-medium',
                dark ? 'text-cyan-200 hover:text-cyan-100' : 'text-brand-700 hover:text-brand-800'
              )}
            >
              {ai.recommendation.ctaText || 'Learn more'} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Provenance: which articles the answer came from */}
        {ai?.sources?.length > 0 && (
          <details className={cn('mt-1.5 text-xs', dark ? 'text-white/45' : 'text-ink-400')}>
            <summary className={cn('cursor-pointer select-none', dark ? 'hover:text-white/75' : 'hover:text-ink-600')}>
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

        {!minimal && (
          <p className={cn('mt-1 text-[11px]', dark ? 'text-white/40' : 'text-ink-400', isCustomer && 'text-right')}>
            {message.pending ? 'Sending…' : clockTime(message.createdAt)}
            {isCustomer && message.readAt && ' · Read'}
          </p>
        )}
      </div>

      {isCustomer && !minimal && (
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            dark ? 'bg-white/10 text-white/70' : 'bg-ink-200 text-ink-600'
          )}
        >
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
