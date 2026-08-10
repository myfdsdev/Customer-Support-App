import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Headphones, GraduationCap, CreditCard, Bug, ArrowRight,
  Megaphone, Sparkles, BookOpen, PlayCircle, AlertTriangle, Wrench,
} from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import VideoCard from '../../components/support/VideoCard';
import { Badge } from '../../components/ui';
import { timeAgo } from '../../utils/format';

const CATEGORY_ICONS = {
  'Getting Started': Sparkles,
  Features: BookOpen,
  Credits: CreditCard,
  Billing: CreditCard,
  Payment: CreditCard,
  API: Wrench,
  Troubleshooting: Bug,
  FAQs: BookOpen,
};

const ANNOUNCEMENT_TONE = {
  Maintenance: 'amber',
  'Service Notice': 'amber',
  'New Feature': 'indigo',
  'Product Update': 'blue',
  'Training Update': 'purple',
  'General Announcement': 'gray',
};

/**
 * The support homepage for one product.
 *
 * Support actions come first and occupy the top of the page. Product
 * discovery lives at the bottom under "More from our team" and is never
 * allowed to interrupt a support task.
 */
export default function ProductSupport() {
  const { product, home, productSlug } = useSupport();
  const navigate = useNavigate();

  const openVideo = async (video) => {
    supportService.videoClick(productSlug, video._id).catch(() => null);
    window.open(video.videoUrl, '_blank', 'noopener');
  };

  const openRecommendation = async (rec) => {
    supportService.recommendationClick(productSlug, rec._id).catch(() => null);
    if (rec.ctaUrl?.startsWith('/')) navigate(rec.ctaUrl);
    else if (rec.ctaUrl) window.open(rec.ctaUrl, '_blank', 'noopener');
  };

  const actions = [
    {
      title: 'Ask AI Assistant',
      description: 'Instant answers from verified product documentation.',
      icon: MessageSquare,
      to: `/support/${productSlug}/chat`,
      primary: true,
    },
    {
      title: 'Talk to Support',
      description: 'Chat live with a person from our team.',
      icon: Headphones,
      to: `/support/${productSlug}/live-support`,
    },
    {
      title: 'Training & Tutorials',
      description: 'Short walkthroughs for every feature.',
      icon: GraduationCap,
      to: `/support/${productSlug}/training`,
    },
    {
      title: 'Billing & Payment Help',
      description: 'Invoices, plans, credits and refunds.',
      icon: CreditCard,
      to: `/support/${productSlug}/chat?topic=billing`,
    },
    {
      title: 'Report a Problem',
      description: 'Something broken? Tell us what happened.',
      icon: Bug,
      to: `/support/${productSlug}/chat?topic=problem`,
    },
  ];

  const urgent = (home?.announcements || []).filter((a) => ['high', 'urgent'].includes(a.priority));
  const normal = (home?.announcements || []).filter((a) => !['high', 'urgent'].includes(a.priority));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center">
        {product.logo ? (
          <img src={product.logo} alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
            style={{ background: product.brandColor || '#4f46e5' }}
          >
            <Headphones className="h-7 w-7" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">{product.name} Support Centre</h1>
        <p className="mt-2 text-ink-500">How can we help you today?</p>
      </div>

      {/* Service notices go above everything — they answer the question before
          the customer asks it. */}
      {urgent.length > 0 && (
        <div className="mt-6 space-y-2">
          {urgent.map((a) => (
            <div key={a._id} className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">{a.title}</p>
                {a.content && <p className="mt-0.5 text-sm text-amber-800">{a.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary actions */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.title}
            to={a.to}
            className={`group flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-card ${
              a.primary ? 'border-brand-200 bg-brand-50/60 hover:border-brand-400' : 'border-ink-200 bg-white hover:border-ink-300'
            }`}
          >
            <div
              className={`rounded-lg p-2 ${a.primary ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}
            >
              <a.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{a.title}</p>
              <p className="mt-0.5 text-xs text-ink-500">{a.description}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-500" />
          </Link>
        ))}
      </div>

      {/* Popular help */}
      {home?.popularHelp?.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Popular help</h2>
            <Link to={`/support/${productSlug}/help`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Browse all
            </Link>
          </div>

          {home.categories?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {home.categories.slice(0, 8).map((c) => {
                const Icon = CATEGORY_ICONS[c.category] || BookOpen;
                return (
                  <Link
                    key={c.category}
                    to={`/support/${productSlug}/help?category=${encodeURIComponent(c.category)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-700"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {c.category}
                    <span className="text-ink-400">{c.count}</span>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {home.popularHelp.map((article) => (
              <Link
                key={article._id}
                to={`/support/${productSlug}/help/${article._id}`}
                className="group rounded-xl border border-ink-200 bg-white p-3.5 transition-colors hover:border-brand-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900 group-hover:text-brand-700">{article.title}</p>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-500" />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-ink-500">{article.summary}</p>
                <Badge tone="gray" className="mt-2">{article.category}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Training */}
      {home?.videos?.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Training & tutorials</h2>
            <Link to={`/support/${productSlug}/training`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              See all
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.videos.slice(0, 3).map((v) => (
              <VideoCard key={v._id} video={v} onClick={openVideo} />
            ))}
          </div>
        </section>
      )}

      {/* Product updates */}
      {normal.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-ink-900">Product updates</h2>
          <div className="space-y-2">
            {normal.map((a) => (
              <div key={a._id} className="rounded-xl border border-ink-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Megaphone className="h-4 w-4 text-ink-400" />
                  <p className="text-sm font-medium text-ink-900">{a.title}</p>
                  <Badge tone={ANNOUNCEMENT_TONE[a.type] || 'gray'}>{a.type}</Badge>
                  <span className="ml-auto text-xs text-ink-400">{timeAgo(a.startAt)}</span>
                </div>
                {a.content && <p className="mt-1.5 text-sm text-ink-600">{a.content}</p>}
                {a.linkUrl && (
                  <a
                    href={a.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {a.linkText || 'Read more'} <ArrowRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discovery — last, quiet, and clearly separated from support. */}
      {home?.recommendations?.length > 0 && (
        <section className="mt-12 border-t border-ink-200 pt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-500">More from our team</h2>
          <p className="mb-4 text-xs text-ink-400">Other tools you might find useful.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.recommendations.map((rec) => (
              <button
                key={rec._id}
                onClick={() => openRecommendation(rec)}
                className="group flex flex-col rounded-xl border border-dashed border-ink-300 bg-white p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-center gap-2">
                  {rec.product?.logo ? (
                    <img src={rec.product.logo} alt="" className="h-6 w-6 rounded object-cover" />
                  ) : (
                    <PlayCircle className="h-5 w-5 text-ink-400" />
                  )}
                  <span className="text-xs font-medium text-ink-500">{rec.product?.name}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink-900">{rec.title}</p>
                <p className="mt-1 flex-1 text-xs text-ink-500">{rec.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                  {rec.ctaText || 'Learn more'} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
