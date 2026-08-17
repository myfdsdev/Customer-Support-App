import React from 'react';
import cn from '../../utils/cn';

/**
 * One labelled group of fields inside a form card.
 *
 * Groups are separated by a rule rather than by whitespace alone, so a long
 * form reads as a handful of decisions instead of one wall of inputs. The
 * first group in a stack drops its rule, since there is nothing above it to
 * divide from.
 */
export default function FormSection({ title, description, children, className }) {
  return (
    <section className={cn('border-t border-ink-200 pt-6 first:border-t-0 first:pt-0', className)}>
      {title && <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h3>}
      {description && <p className="mt-1 max-w-2xl text-xs text-ink-500">{description}</p>}
      <div className={cn(title || description ? 'mt-4' : '')}>{children}</div>
    </section>
  );
}

/** The heading strip at the top of a form card. */
export function CardHeader({ title, description, icon: Icon, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 pb-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          {Icon && <Icon className="h-4 w-4 text-brand-700" />}
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
