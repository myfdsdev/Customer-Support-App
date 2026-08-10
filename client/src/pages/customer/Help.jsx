import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, BookOpen, ArrowRight, MessageSquare } from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import { Spinner, EmptyState, Badge } from '../../components/ui';
import cn from '../../utils/cn';

export default function Help() {
  const { productSlug, product } = useSupport();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(params.get('q') || '');

  const category = params.get('category') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Debounced so typing does not fire a request per keystroke.
    const t = setTimeout(() => {
      supportService
        .help(productSlug, { q: query || undefined, category: category || undefined })
        .then((res) => !cancelled && setData(res))
        .finally(() => !cancelled && setLoading(false));
    }, query ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productSlug, query, category]);

  const setCategory = (c) => {
    const next = new URLSearchParams(params);
    if (c) next.set('category', c);
    else next.delete('category');
    setParams(next, { replace: true });
  };

  const articles = data?.articles || [];
  const categories = useMemo(() => data?.categories || [], [data]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{product.name} help centre</h1>
        <p className="mt-1 text-sm text-ink-500">Search verified documentation, or ask the assistant.</p>
      </div>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${product.name} help…`}
          aria-label="Search help articles"
          className="input py-2.5 pl-9"
        />
      </div>

      {categories.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory('')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              !category ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setCategory(c.category === category ? '' : c.category)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                category === c.category
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
              )}
            >
              {c.category} <span className="text-ink-400">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing found"
          description={
            query
              ? `We could not find an article about "${query}". The assistant may still be able to help.`
              : 'No published help articles for this product yet.'
          }
          action={
            <Link to={`/support/${productSlug}/chat`} className="btn-primary">
              <MessageSquare className="h-4 w-4" /> Ask the assistant
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <Link
              key={a._id}
              to={`/support/${productSlug}/help/${a._id}`}
              className="group flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 transition-colors hover:border-brand-300"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900 group-hover:text-brand-700">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{a.summary}</p>
                <Badge tone="gray" className="mt-2">{a.category}</Badge>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-500" />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-ink-200 bg-white p-5 text-center">
        <p className="text-sm font-medium text-ink-900">Still stuck?</p>
        <p className="mt-1 text-xs text-ink-500">Ask the assistant, or talk to a person from our team.</p>
        <div className="mt-3 flex justify-center gap-2">
          <Link to={`/support/${productSlug}/chat`} className="btn-primary">
            Ask AI Assistant
          </Link>
          <Link to={`/support/${productSlug}/live-support`} className="btn-secondary">
            Talk to Support
          </Link>
        </div>
      </div>
    </div>
  );
}
