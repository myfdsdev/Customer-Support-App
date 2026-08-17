import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, CheckCircle2, Sparkles, MessageSquare } from 'lucide-react';
import cn from '../../utils/cn';
import { ProductLogo, Badge } from '../ui';
import { timeAgo } from '../../utils/format';

/* --------------------------------------------------------------------------
 * Reusable customer-portal cards. All presentational — data comes from the
 * dashboard/product endpoints, never composed on the client.
 * ----------------------------------------------------------------------- */

/** Big "Continue where you left off" hero card. */
export function ContinueProductCard({ product, onLaunch, launching }) {
  if (!product) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <ProductLogo product={product} className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Continue where you left off</p>
            <h3 className="truncate text-lg font-semibold text-ink-900">{product.name}</h3>
            {product.tagline && <p className="truncate text-sm text-ink-500">{product.tagline}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to={product.productUrl} className="btn-secondary">
            View product
          </Link>
          {product.canLaunch && (
            <button type="button" onClick={() => onLaunch(product)} className="btn-primary" disabled={launching}>
              Open App <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Product tile in the "Your Apps" grid. */
export function PurchasedProductCard({ product, onLaunch, launching }) {
  return (
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-pop">
      <Link to={product.productUrl} className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <ProductLogo product={product} className="h-12 w-12" />
          {product.discovery ? (
            <Badge tone="indigo">Available</Badge>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Purchased
            </span>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-ink-900">{product.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{product.shortDescription}</p>
        </div>
      </Link>
      <div className="flex items-center gap-2 border-t border-ink-100 px-5 py-3">
        <Link to={product.productUrl} className="btn-secondary flex-1 justify-center">
          View product
        </Link>
        {product.canLaunch && (
          <button
            type="button"
            onClick={() => onLaunch(product)}
            className="btn-primary shrink-0"
            disabled={launching}
            title="Open App"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A marketing/recommendation card — always carries a disclosure badge. */
export function RecommendationCard({ item, onClick }) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
          <Sparkles className="h-3 w-3" /> {item.badge}
        </span>
        <ArrowRight className="h-4 w-4 text-ink-300" />
      </div>
      <h3 className="mt-3 font-semibold text-ink-900">{item.title}</h3>
      {item.description && <p className="mt-1 line-clamp-3 text-sm text-ink-500">{item.description}</p>}
      {item.ctaText && <span className="mt-3 inline-block text-sm font-medium text-brand-700">{item.ctaText}</span>}
    </>
  );

  const className = 'card block p-5 text-left transition-shadow hover:shadow-pop';
  if (item.href && !item.external) {
    return (
      <Link to={item.href} onClick={() => onClick?.(item)} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={item.href || '#'}
      onClick={() => onClick?.(item)}
      target={item.external ? '_blank' : undefined}
      rel="noreferrer"
      className={className}
    >
      {inner}
    </a>
  );
}

/** A "What's New" announcement / product-update card. */
export function AnnouncementCard({ item }) {
  return (
    <div className="card overflow-hidden p-5">
      <div className="flex items-center gap-2">
        <Badge tone={item.type === 'Product Update' ? 'indigo' : 'green'}>{item.type}</Badge>
        {item.product && <span className="text-xs text-ink-400">{item.product.name}</span>}
      </div>
      <h3 className="mt-2 font-semibold text-ink-900">{item.title}</h3>
      {item.content && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-ink-600">{item.content}</p>}
      {item.linkUrl && (
        <a href={item.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          {item.linkText || 'Learn more'} <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/** A recent conversation row in the support panel / messages list. */
export function RecentConversationCard({ conversation }) {
  const to = conversation.product
    ? `/portal/support/${conversation.product.slug}/${conversation.channel === 'human' ? 'team' : 'ai'}`
    : '/portal/conversations';
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 hover:bg-ink-50">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', conversation.channel === 'human' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600')}>
        <MessageSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink-900">
            {conversation.product?.name || 'Support'} · {conversation.channel === 'human' ? 'Team' : 'AI'}
          </p>
          <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(conversation.lastMessageAt)}</span>
        </div>
        <p className="truncate text-xs text-ink-500">{conversation.lastMessagePreview || 'No messages yet'}</p>
      </div>
      {conversation.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
    </Link>
  );
}
