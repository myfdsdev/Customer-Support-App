import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, CheckCircle2, Gift, ShieldCheck, Sparkles, Star, MessageSquare } from 'lucide-react';
import cn from '../../utils/cn';
import { ProductLogo, Badge } from '../ui';
import { timeAgo } from '../../utils/format';

/* --------------------------------------------------------------------------
 * Reusable customer-portal cards, laid out to match the approved wireframe.
 * All presentational — data comes from the dashboard/product endpoints.
 * ----------------------------------------------------------------------- */

/** A light workspace doodle for the "Continue" hero — decorative only. */
export function WorkspaceScene({ className }) {
  return (
    <svg viewBox="0 0 340 180" fill="none" className={className} aria-hidden="true">
      {/* plant */}
      <path d="M60 150c-6-20-4-38 6-46" stroke="#8ec400" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M66 150c8-16 8-34 0-44" stroke="#8ec400" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M66 150c10-14 22-22 34-22" stroke="#8ec400" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M50 150h34l-4 20H54z" stroke="#334155" strokeWidth="2.5" strokeLinejoin="round" />
      {/* laptop */}
      <rect x="150" y="60" width="130" height="80" rx="6" stroke="#334155" strokeWidth="2.5" />
      <path d="M138 150h154l-8-10H146z" stroke="#334155" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="215" cy="100" r="18" fill="#f0fccf" stroke="#8ec400" strokeWidth="2.5" />
      <path d="M210 92l12 8-12 8z" fill="#8ec400" />
      <path d="M250 82h20M250 94h20M250 106h14" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      {/* mug */}
      <rect x="300" y="120" width="26" height="24" rx="4" stroke="#334155" strokeWidth="2.5" />
      <path d="M326 126h6a5 5 0 0 1 0 10h-6" stroke="#334155" strokeWidth="2.5" />
      <path d="M308 112c0-4 6-4 6-8M318 112c0-4 6-4 6-8" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Big "Continue where you left off" hero card. */
export function ContinueProductCard({ product, onLaunch, launching }) {
  if (!product) return null;
  return (
    <div className="card overflow-hidden">
      <div className="grid items-center gap-4 p-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-lg font-semibold text-ink-900">Continue where you left off</p>
          <div className="mt-4 flex items-center gap-4">
            <ProductLogo product={product} className="h-16 w-16 shrink-0 rounded-2xl" />
            <div className="min-w-0">
              <Link to={product.productUrl} className="block truncate text-xl font-semibold text-ink-900 hover:text-brand-700">
                {product.name}
              </Link>
              <p className="truncate text-sm text-ink-500">{product.tagline || 'Your workspace is ready'}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {product.canLaunch && (
              <button type="button" onClick={() => onLaunch(product)} className="btn-primary" disabled={launching}>
                Open App <ExternalLink className="h-4 w-4" />
              </button>
            )}
            <Link to={product.productUrl} className="btn-secondary">
              View product
            </Link>
          </div>
        </div>
        <WorkspaceScene className="hidden h-40 w-72 md:block" />
      </div>
    </div>
  );
}

/** Product tile in the "Your Apps" grid. */
export function PurchasedProductCard({ product, onLaunch, launching }) {
  const owned = !product.discovery;
  return (
    <div className="card flex flex-col overflow-hidden transition-shadow hover:shadow-pop">
      <Link to={product.productUrl} className="flex items-center gap-3 p-4">
        <ProductLogo product={product} className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink-900">{product.name}</h3>
          {product.shortDescription && <p className="truncate text-xs text-ink-500">{product.shortDescription}</p>}
        </div>
      </Link>
      <div className="mt-auto flex items-center justify-between border-t border-ink-100 px-4 py-2.5">
        {owned ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
            <CheckCircle2 className="h-4 w-4" /> Purchased
          </span>
        ) : (
          <Badge tone="indigo">Available</Badge>
        )}
        {owned && product.canLaunch ? (
          <button
            type="button"
            onClick={() => onLaunch(product)}
            className="btn-secondary !border-brand-300 !text-brand-700 hover:!bg-brand-50"
            disabled={launching}
          >
            Open
          </button>
        ) : (
          <Link to={product.productUrl} className="btn-secondary !border-brand-300 !text-brand-700 hover:!bg-brand-50">
            {owned ? 'View' : 'Learn more'}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Icon chosen from the disclosure badge, matching the wireframe's motif. */
function recIcon(badge) {
  if (badge === 'Upgrade' || badge === 'Add-on') return Gift;
  if (badge === 'Featured') return Star;
  if (badge === 'New') return Sparkles;
  return ShieldCheck;
}

/** A marketing/recommendation card — always carries a disclosure badge. */
export function RecommendationCard({ item, onClick }) {
  const Icon = recIcon(item.badge);
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink-900">{item.title}</h3>
            <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-800">
              {item.badge}
            </span>
          </div>
          {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{item.description}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end">
        <span className="btn-secondary !border-brand-300 !text-brand-700">{item.ctaText || 'View Offer'}</span>
      </div>
    </>
  );

  const className = 'card block p-4 text-left transition-shadow hover:shadow-pop';
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
  const body = (
    <div className="card flex gap-4 p-4 transition-shadow hover:shadow-pop">
      <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Sparkles className="h-6 w-6 text-ink-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-ink-900">{item.title}</h3>
        </div>
        {item.content && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{item.content}</p>}
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          Read More <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
  return item.linkUrl ? (
    <a href={item.linkUrl} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    body
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
