import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Rocket, ListChecks, HelpCircle, BookOpen,
  Lightbulb, LifeBuoy, Lock, PlayCircle,
} from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button, ProductLogo } from '../../components/ui';
import { RecommendationCard } from '../../components/portal/cards';
import { useLaunch } from '../../components/portal/useLaunch';
import { portalService } from '../../services/portalApi';

/** Renders one admin-configured section of a product page. */
function SectionBlock({ id, page, product, related }) {
  const heading = (icon, text) => (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink-900">
      {icon}
      {text}
    </h2>
  );
  const prose = (text) =>
    text ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{text}</p> : null;

  switch (id) {
    case 'overview':
      if (!page.overviewContent) return null;
      return (
        <section className="card p-6">
          {heading(<BookOpen className="h-5 w-5 text-brand-700" />, 'Overview')}
          {prose(page.overviewContent)}
        </section>
      );
    case 'getting_started':
      if (!page.gettingStartedContent) return null;
      return (
        <section className="card p-6">
          {heading(<Rocket className="h-5 w-5 text-brand-700" />, 'Getting Started')}
          {prose(page.gettingStartedContent)}
        </section>
      );
    case 'how_it_works':
      if (!page.howItWorksContent) return null;
      return (
        <section className="card p-6">
          {heading(<Lightbulb className="h-5 w-5 text-brand-700" />, 'How It Works')}
          {prose(page.howItWorksContent)}
        </section>
      );
    case 'features':
      if (!page.featureItems?.length) return null;
      return (
        <section className="card p-6">
          {heading(<ListChecks className="h-5 w-5 text-brand-700" />, 'Key Features')}
          <div className="grid gap-4 sm:grid-cols-2">
            {page.featureItems.map((f, i) => (
              <div key={i} className="rounded-lg border border-ink-100 p-4">
                <p className="font-medium text-ink-900">{f.title}</p>
                {f.description && <p className="mt-1 text-sm text-ink-600">{f.description}</p>}
              </div>
            ))}
          </div>
        </section>
      );
    case 'resources':
      if (!page.resourceLinks?.length) return null;
      return (
        <section className="card p-6">
          {heading(<BookOpen className="h-5 w-5 text-brand-700" />, 'Helpful Resources')}
          <ul className="space-y-2">
            {page.resourceLinks.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                  <ExternalLink className="h-4 w-4" /> {r.label || r.url}
                </a>
                {r.description && <p className="text-xs text-ink-500">{r.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      );
    case 'faq':
      if (!page.faqItems?.length) return null;
      return (
        <section className="card p-6">
          {heading(<HelpCircle className="h-5 w-5 text-brand-700" />, 'FAQ')}
          <div className="divide-y divide-ink-100">
            {page.faqItems.map((f, i) => (
              <details key={i} className="group py-3">
                <summary className="cursor-pointer list-none font-medium text-ink-900">{f.question}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case 'support':
      return (
        <section className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {heading(<LifeBuoy className="h-5 w-5 text-brand-700" />, 'Need a hand?')}
            <p className="text-sm text-ink-600">Our AI assistant and support team can help with {product.name}.</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/portal/support/${product.slug}/ai`} className="btn-secondary">Chat with AI</Link>
            <Link to={`/portal/support/${product.slug}/team`} className="btn-primary">Chat with Our Team</Link>
          </div>
        </section>
      );
    case 'related':
      if (!related?.length) return null;
      return (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink-900">You might also like</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <RecommendationCard key={r._id} item={r} />
            ))}
          </div>
        </section>
      );
    default:
      return null;
  }
}

export default function ProductDetail() {
  const { productSlug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | error | revoked | locked
  const [error, setError] = useState('');
  const { launch, launchingId } = useLaunch();

  const load = async () => {
    setState('loading');
    try {
      const res = await portalService.product(productSlug);
      setData(res);
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
  }, [productSlug]);

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
  const pg = p.page;

  return (
    <div>
      <button onClick={() => navigate('/portal/products')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Back to my products
      </button>

      {/* Hero */}
      <section className="card overflow-hidden">
        {pg.heroImage && (
          <div className="h-48 w-full bg-ink-100">
            <img src={pg.heroImage} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProductLogo product={p} className="h-16 w-16 shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-ink-900">{pg.heroTitle || p.name}</h1>
              {pg.heroSubtitle && <p className="text-ink-500">{pg.heroSubtitle}</p>}
            </div>
          </div>
          {data.canLaunch && (
            <Button onClick={() => launch(p)} loading={launchingId === p._id} className="shrink-0">
              Open App <ExternalLink className="h-4 w-4" />
            </Button>
          )}
          {!data.canLaunch && data.access === 'discovery' && p.purchaseUrl && (
            <a href={p.purchaseUrl} target="_blank" rel="noreferrer" className="btn-primary shrink-0">
              Get {p.name} <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        {pg.heroVideoUrl && (
          <div className="border-t border-ink-100 p-6">
            <a href={pg.heroVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
              <PlayCircle className="h-5 w-5" /> Watch the intro video
            </a>
          </div>
        )}
      </section>

      {/* Sections in admin-configured order */}
      <div className="mt-6 space-y-6">
        {(data.sections || []).filter((id) => id !== 'hero').map((id) => (
          <SectionBlock key={id} id={id} page={pg} product={p} related={data.related} />
        ))}
      </div>
    </div>
  );
}
