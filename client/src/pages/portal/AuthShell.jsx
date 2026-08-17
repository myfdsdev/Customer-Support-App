import React from 'react';

/**
 * Centred card used by every portal auth screen. Warm-white background, a
 * restrained green brand mark, generous spacing — the friendly SaaS feel the
 * brief asks for without hand-drawn styling.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-ink-900">
            Y
          </span>
          <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
      </div>
    </div>
  );
}
