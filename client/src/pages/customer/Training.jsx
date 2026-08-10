import React, { useEffect, useMemo, useState } from 'react';
import { Search, GraduationCap } from 'lucide-react';
import { useSupport } from '../../context/SupportContext';
import { supportService } from '../../services/endpoints';
import VideoCard from '../../components/support/VideoCard';
import { Spinner, EmptyState } from '../../components/ui';
import cn from '../../utils/cn';

export default function Training() {
  const { productSlug, product } = useSupport();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supportService
      .training(productSlug)
      .then((data) => !cancelled && setVideos(data.videos || []))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  const categories = useMemo(() => [...new Set(videos.map((v) => v.category).filter(Boolean))], [videos]);

  // Filtering client-side keeps the page instant; the list is small by design.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return videos.filter((v) => {
      if (category && v.category !== category) return false;
      if (!q) return true;
      return `${v.title} ${v.description} ${v.feature} ${(v.keywords || []).join(' ')}`.toLowerCase().includes(q);
    });
  }, [videos, search, category]);

  const openVideo = (video) => {
    supportService.videoClick(productSlug, video._id).catch(() => null);
    window.open(video.videoUrl, '_blank', 'noopener');
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">Training & tutorials</h1>
        <p className="mt-1 text-sm text-ink-500">Short walkthroughs for {product.name}.</p>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tutorials…"
            aria-label="Search tutorials"
            className="input pl-9"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategory('')}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                !category ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c === category ? '' : c)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-600'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading tutorials…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={search || category ? 'No tutorials match that' : 'No tutorials yet'}
          description={
            search || category
              ? 'Try a different search or clear the filter.'
              : `Training videos for ${product.name} will appear here once the team publishes them.`
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VideoCard key={v._id} video={v} onClick={openVideo} />
          ))}
        </div>
      )}
    </div>
  );
}
