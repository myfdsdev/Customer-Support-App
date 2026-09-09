import React from 'react';

/**
 * Centred card used by every portal auth screen. Warm-white background,
 * generous spacing — the friendly SaaS feel the brief asks for without
 * hand-drawn styling.
 *
 * These screens sit OUTSIDE PortalLayout (there is no navbar before sign-in),
 * so the Fly Support mark and the portal's Unbounded face are both declared
 * here — otherwise login and register are the only customer-facing pages that
 * look like a different product.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10 font-unbounded">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/images/brand/fly-support-logo.png"
            alt="Fly Support"
            className="mb-4 h-8 w-auto"
          />
          <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        <div className="card p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
      </div>
    </div>
  );
}
