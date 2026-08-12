import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, MessageSquare, ArrowRight } from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import { Spinner, ErrorState, Badge } from '../../components/ui';
import { fullTime } from '../../utils/format';

/** Renders article content as paragraphs and ordered/unordered steps. */
function ArticleBody({ content = '' }) {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n{2,}/);

  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-700">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const numbered = lines.every((l) => /^\d+[.)]\s+/.test(l));
        const bulleted = lines.every((l) => /^[-*•]\s+/.test(l));

        if (numbered && lines.length > 1) {
          return (
            <ol key={i} className="space-y-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
                    {j + 1}
                  </span>
                  <span>{l.replace(/^\d+[.)]\s+/, '')}</span>
                </li>
              ))}
            </ol>
          );
        }

        if (bulleted && lines.length > 1) {
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" />
                  <span>{l.replace(/^[-*•]\s+/, '')}</span>
                </li>
              ))}
            </ul>
          );
        }

        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

export default function HelpArticle() {
  const { articleId } = useParams();
  const { productSlug, product } = useSupport();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    supportService
      .article(productSlug, articleId)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err.friendlyMessage || 'Article not found'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productSlug, articleId]);

  if (loading) return <Spinner className="py-20" />;
  if (error) return <ErrorState message={error} onRetry={() => navigate(-1)} />;

  const { article, related } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to={`/support/${productSlug}/help`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" /> All help articles
      </Link>

      <article className="rounded-xl border border-ink-200 bg-white p-6">
        <Badge tone="indigo">{article.category}</Badge>
        <h1 className="mt-3 text-xl font-bold text-ink-900 sm:text-2xl">{article.title}</h1>
        <p className="mt-1 text-xs text-ink-400">Updated {fullTime(article.updatedAt)}</p>
        <div className="mt-5 border-t border-ink-200 pt-5">
          <ArticleBody content={article.content} />
        </div>
      </article>

      {related?.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Related articles</h2>
          <div className="space-y-2">
            {related.map((r) => (
              <Link
                key={r._id}
                to={`/support/${productSlug}/help/${r._id}`}
                className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 transition-colors hover:border-brand-300"
              >
                <BookOpen className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800 group-hover:text-brand-800">{r.title}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-700" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 rounded-xl border border-ink-200 bg-white p-5 text-center">
        <p className="text-sm font-medium text-ink-900">Did this answer your question?</p>
        <p className="mt-1 text-xs text-ink-500">If not, the {product.name} assistant can help with your exact case.</p>
        <div className="mt-3 flex justify-center gap-2">
          <Link to={`/support/${productSlug}/chat`} className="btn-primary">
            <MessageSquare className="h-4 w-4" /> Ask the assistant
          </Link>
          <Link to={`/support/${productSlug}/live-support`} className="btn-secondary">
            Talk to Support
          </Link>
        </div>
      </div>
    </div>
  );
}
