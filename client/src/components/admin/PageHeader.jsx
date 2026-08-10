import React from 'react';

export default function PageHeader({ title, description, actions, children }) {
  return (
    <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
