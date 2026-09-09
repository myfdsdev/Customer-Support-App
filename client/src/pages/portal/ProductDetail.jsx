import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, ExternalLink, Lock, PlayCircle, MessageSquare,
  LifeBuoy, FileText, Download, Video as VideoIcon, Link as LinkIcon, Sparkles,
} from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button, Badge, ProductLogo } from '../../components/ui';
import { RecommendationCard } from '../../components/portal/cards';
import { useLaunch } from '../../components/portal/useLaunch';
import { portalService } from '../../services/portalApi';
import { fullTime, videoDuration } from '../../utils/format';
import cn from '../../utils/cn';

/**
 * The customer-facing product page.
 *
 * Laid out as an article with a sticky rail: the story of the product runs down
 * the main column, while the things a customer reaches for while reading —
 * help, jump links, resources, what to look at next — stay pinned beside it.
 *
 * Section ORDER still comes from the admin's configuration; this file only
 * decides which column each section belongs in. Support, resources and related
 * are rail material by nature, so they are pulled out of the main flow.
 */

const RAIL_SECTIONS = new Set(['support', 'resources', 'related']);

/** Sections that render in the main column, with the anchor + label the rail uses. */
const MAIN_SECTIONS = {
  about: { id: 'about', label: 'About the Product' },
  overview: { id: 'overview', label: 'Product Overview' },
  tutorials: { id: 'videos', label: 'Product Videos' },
  features: { id: 'features', label: 'Key Features' },
  getting_started: { id: 'getting-started', label: 'Getting Started' },
  how_it_works: { id: 'how-it-works', label: 'How It Works' },
  faq: { id: 'faq', label: 'FAQs' },
};

const RESOURCE_ICON = { doc: FileText, download: Download, video: VideoIcon, link: LinkIcon };

/**
 * A YouTube still, derived from the URL when no thumbnail was uploaded. Saves
 * every product from needing hand-made poster art before its videos look right.
 */
function posterFor(video) {
  if (video.thumbnailUrl) return video.thumbnailUrl;
  const m = String(video.videoUrl || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : '';
}

function Prose({ text }) {
  if (!text) return null;
  return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-600">{text}</p>;
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-ink-100 px-6 py-7 first:border-t-0">
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RailCard({ title, children }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export default function ProductDetail() {
  const { productSlug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | error | revoked | locked
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState(null);
  const { launch, launchingId } = useLaunch();

  const load = async () => {
    setState('loading');
    try {
      setData(await portalService.product(productSlug));
      setState('ok');
    } catch (err) {
      const status = err?.response?.status;
      const reason = err?.response?.data?.details?.reason;
      if (status === 403 && reason === 'revoked') setState('revoked');
      else if (status === 403) setState('locked');
      else {
        setError(err.friendlyMessage || 'Could not load this product.');
        setState('error');
      }
    }
  };

  useEffect(() => {
    load();
    setOpenFaq(null);
  }, [productSlug]);

  // The sections the admin enabled, split into the two columns.
  const { mainOrder, showSupport, showRelated } = useMemo(() => {
    // The API nests this under `product`; reading it off the root silently
    // produced an empty list, which is why the page rendered only its header.
    const sections = data?.product?.sections || [];
    return {
      mainOrder: sections.filter((s) => !RAIL_SECTIONS.has(s) && s !== 'hero'),
      showSupport: sections.includes('support'),
      showRelated: sections.includes('related'),
    };
  }, [data]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading product…" />
      </div>
    );
  }

  if (state === 'error') return <ErrorState message={error} onRetry={load} />;

  if (state === 'revoked' || state === 'locked') {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          icon={Lock}
          title={state === 'revoked' ? 'Your access to this product isn’t active' : 'You don’t have access to this product'}
          description={
            state === 'revoked'
              ? 'This can happen after a refund or cancellation. If you believe this is a mistake, contact our team.'
              : 'This product isn’t linked to your account. If you purchased it, try refreshing your purchases.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/portal/products" className="btn-secondary">Back to my products</Link>
              <Link to="/portal/support" className="btn-primary">Contact support</Link>
            </div>
          }
        />
      </div>
    );
  }

  const p = data.product;
  const pg = p.page || {};
  const tutorials = data.tutorials || [];
  const related = data.related || [];
  const about = p.description || pg.heroSubtitle || p.tagline || '';

  // Only sections that actually have something to show become anchors.
  const hasContent = {
    about: Boolean(about),
    overview: Boolean(pg.overviewContent),
    tutorials: tutorials.length > 0,
    features: (pg.featureItems || []).length > 0,
    getting_started: Boolean(pg.gettingStartedContent),
    how_it_works: Boolean(pg.howItWorksContent),
    faq: (pg.faqItems || []).length > 0,
  };
  const rendered = mainOrder.filter((s) => MAIN_SECTIONS[s] && hasContent[s]);
  // "About" is not an admin section; it leads the article whenever there is copy.
  const anchors = [
    ...(hasContent.about ? [MAIN_SECTIONS.about] : []),
    ...rendered.map((s) => MAIN_SECTIONS[s]),
  ];

  const meta = [
    p.category && { label: 'Category', value: p.category },
    p.platform && { label: 'Platform', value: p.platform },
    p.lastUpdated && { label: 'Last Updated', value: fullTime(p.lastUpdated).split(',')[0] },
    p.status && { label: 'Status', value: p.status, dot: true },
  ].filter(Boolean);

  const renderSection = (key) => {
    const s = MAIN_SECTIONS[key];
    switch (key) {
      case 'overview':
        return <Section key={key} id={s.id} title={s.label}><Prose text={pg.overviewContent} /></Section>;
      case 'getting_started':
        return <Section key={key} id={s.id} title={s.label}><Prose text={pg.gettingStartedContent} /></Section>;
      case 'how_it_works':
        return <Section key={key} id={s.id} title={s.label}><Prose text={pg.howItWorksContent} /></Section>;

      case 'tutorials':
        return (
          <Section key={key} id={s.id} title={s.label}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {tutorials.map((v) => {
                const poster = posterFor(v);
                return (
                  <a
                    key={v._id}
                    href={v.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group block"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-900">
                      {poster && (
                        <img src={poster} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
                      )}
                      <span className="absolute inset-0 grid place-items-center">
                        <PlayCircle className="h-10 w-10 text-white drop-shadow" />
                      </span>
                      {v.duration > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                          {videoDuration(v.duration)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink-800 group-hover:text-brand-700">{v.title}</p>
                    {v.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{v.description}</p>}
                  </a>
                );
              })}
            </div>
          </Section>
        );

      case 'features':
        return (
          <Section key={key} id={s.id} title={s.label}>
            <div className="grid gap-3 sm:grid-cols-2">
              {pg.featureItems.map((f, i) => (
                <div key={i} className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">{f.title}</p>
                      {f.description && <p className="mt-1 text-sm leading-relaxed text-ink-600">{f.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );

      case 'faq':
        return (
          <Section key={key} id={s.id} title={s.label}>
            <div className="divide-y divide-ink-100 border-y border-ink-100">
              {pg.faqItems.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={i}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
                      aria-expanded={open}
                    >
                      <span className="text-sm font-medium text-ink-800">{f.question}</span>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && <p className="whitespace-pre-wrap pb-4 text-sm leading-relaxed text-ink-600">{f.answer}</p>}
                  </div>
                );
              })}
            </div>
          </Section>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-ink-400" aria-label="Breadcrumb">
        <Link to="/portal/dashboard" className="hover:text-ink-700">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/portal/products" className="hover:text-ink-700">Products</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-ink-700">{p.name}</span>
      </nav>

      {/* Hero */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <ProductLogo product={p} className="h-16 w-16 shrink-0 rounded-xl" rounded="rounded-xl" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-ink-900">{pg.heroTitle || p.name}</h1>
                  <Badge tone={p.status === 'Operational' ? 'green' : 'gray'}>
                    {p.status === 'Operational' ? 'Active' : p.status}
                  </Badge>
                </div>
                {(pg.heroSubtitle || p.tagline) && (
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{pg.heroSubtitle || p.tagline}</p>
                )}
              </div>
            </div>

            {meta.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {meta.map((m) => (
                  <div key={m.label}>
                    <dt className="text-xs text-ink-400">{m.label}</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink-800">
                      {m.dot && (
                        <span className={cn('h-2 w-2 rounded-full', p.status === 'Operational' ? 'bg-emerald-500' : 'bg-ink-300')} />
                      )}
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {data.canLaunch && (
                <Button onClick={() => launch(p)} loading={launchingId === p._id}>
                  Open App <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              {!data.canLaunch && data.access === 'discovery' && p.purchaseUrl && (
                <a href={p.purchaseUrl} target="_blank" rel="noreferrer" className="btn-primary">
                  Get {p.name} <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {pg.heroVideoUrl && (
                <a href={pg.heroVideoUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                  <PlayCircle className="h-4 w-4" /> Watch intro
                </a>
              )}
            </div>
          </div>

          {pg.heroImage && (
            <div className="overflow-hidden rounded-xl bg-ink-50">
              <img src={pg.heroImage} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      </section>

      {/* Article + rail */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          {hasContent.about && (
            <Section id="about" title="About the Product"><Prose text={about} /></Section>
          )}
          {rendered.map(renderSection)}

          {!hasContent.about && rendered.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="This page is still being written"
                description="Your access is active — use Open App to get started, or ask our team anything in the meantime."
              />
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28">
          {showSupport && (
            <RailCard title="Need Help?">
              <p className="text-sm text-ink-500">Our support team is here for you.</p>
              <div className="mt-3 space-y-2">
                <Link to={`/portal/support/${p.slug}/team`} className="btn-primary w-full justify-center">
                  <MessageSquare className="h-4 w-4" /> Live Chat with Support
                </Link>
                <Link to={`/portal/support/${p.slug}/ai`} className="btn-secondary w-full justify-center">
                  <LifeBuoy className="h-4 w-4" /> Ask the AI Assistant
                </Link>
              </div>
            </RailCard>
          )}

          {anchors.length > 1 && (
            <RailCard title="On This Page">
              <ul className="space-y-1.5">
                {anchors.map((a) => (
                  <li key={a.id}>
                    <a href={`#${a.id}`} className="flex items-center gap-2 text-sm text-ink-600 hover:text-brand-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                      {a.label}
                    </a>
                  </li>
                ))}
              </ul>
            </RailCard>
          )}

          {(pg.resourceLinks || []).length > 0 && (
            <RailCard title="Quick Links">
              <ul className="space-y-2">
                {pg.resourceLinks.map((r, i) => {
                  const Icon = RESOURCE_ICON[r.kind] || LinkIcon;
                  return (
                    <li key={i}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-2 text-sm text-ink-600 hover:text-brand-700"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                        <span className="min-w-0">
                          <span className="block">{r.label || r.url}</span>
                          {r.description && <span className="block text-xs text-ink-400">{r.description}</span>}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </RailCard>
          )}

          {showRelated && related.length > 0 && (
            <RailCard title="Recommended for You">
              <div className="space-y-3">
                {related.slice(0, 2).map((r) => (
                  <RecommendationCard key={r._id} item={r} />
                ))}
              </div>
            </RailCard>
          )}

          <button
            type="button"
            onClick={() => navigate('/portal/products')}
            className="w-full text-center text-sm text-ink-400 hover:text-ink-700"
          >
            Back to my products
          </button>
        </aside>
      </div>
    </div>
  );
}
