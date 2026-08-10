import React from 'react';
import { PlayCircle } from 'lucide-react';
import { videoDuration } from '../../utils/format';

export default function VideoCard({ video, onClick, compact }) {
  return (
    <button
      onClick={() => onClick?.(video)}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white text-left transition-all hover:border-brand-300 hover:shadow-card"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-ink-100">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlayCircle className="h-8 w-8 text-ink-300" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-ink-900/0 transition-colors group-hover:bg-ink-900/25">
          <PlayCircle className="h-10 w-10 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        {video.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {videoDuration(video.duration)}
          </span>
        )}
      </div>

      <div className="flex-1 p-3">
        {video.feature && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{video.feature}</span>
        )}
        <p className="mt-0.5 line-clamp-2 text-sm font-medium text-ink-900">{video.title}</p>
        {!compact && video.description && (
          <p className="mt-1 line-clamp-2 text-xs text-ink-500">{video.description}</p>
        )}
      </div>
    </button>
  );
}
