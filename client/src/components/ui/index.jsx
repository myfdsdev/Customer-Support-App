import React from 'react';
import { Loader2, X, Inbox, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import cn from '../../utils/cn';
import { initials as toInitials } from '../../utils/format';
import { productLogo } from '../../utils/productLogo';

/* --------------------------------------------------------------------------
 * Primitives shared by the customer and admin surfaces.
 * ----------------------------------------------------------------------- */

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  subtle: 'bg-ink-100 text-ink-700 hover:bg-ink-200',
};
const SIZES = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-4 py-2.5 text-sm' };

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ label, error, hint, className, id, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <input id={inputId} className={cn('input', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20')} {...rest} />
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, hint, className, id, rows = 4, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={cn('input resize-y', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/20')}
        {...rest}
      />
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Select({ label, error, className, children, id, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <select id={inputId} className={cn('input pr-8', error && 'border-red-400')} {...rest}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const TONES = {
  gray: 'bg-ink-100 text-ink-700',
  green: 'bg-emerald-100 text-emerald-700',
  blue: 'bg-blue-100 text-blue-700',
  indigo: 'bg-brand-100 text-brand-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  slate: 'bg-ink-800 text-white',
};

export function Badge({ tone = 'gray', className, children, ...rest }) {
  return (
    <span className={cn('chip', TONES[tone] || TONES.gray, className)} {...rest}>
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 'md', className }) {
  const dims = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };
  if (src) {
    return <img src={src} alt={name || ''} className={cn('rounded-full object-cover', dims[size], className)} />;
  }
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700',
        dims[size],
        className
      )}
      aria-hidden="true"
    >
      {toInitials(name)}
    </div>
  );
}

/**
 * A product's mark: its uploaded logo, else the icon of its website, else a
 * fallback on its brand colour.
 *
 * Each step falls through on a load error too, so a dead image URL degrades to
 * the fallback instead of leaving a broken frame.
 */
export function ProductLogo({ product, className, rounded = 'rounded-lg', fallback }) {
  const { src, source } = productLogo(product);
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => setBroken(false), [src]);

  const shell = 'flex shrink-0 items-center justify-center overflow-hidden';
  const background = product?.brandColor || '#1E293B';

  if (!src || broken) {
    return (
      <span className={cn(shell, rounded, className)} style={{ backgroundColor: background }}>
        {fallback || (
          <span className="text-sm font-bold text-white">{(product?.name || '?').slice(0, 2).toUpperCase()}</span>
        )}
      </span>
    );
  }

  // Both kinds of mark are contained, never cropped: a logo is artwork whose whole
  // shape carries the meaning, so `object-cover` would slice the top and bottom off
  // any logo whose proportions differ from its frame. Whatever the fit leaves over
  // shows the brand colour.
  //
  // The inset is a percentage rather than a padding class because this renders at
  // everything from a 32px header mark to a 240px tile — a fixed padding that gave
  // the tile room would swallow the small ones. The favicon sits tighter still: it
  // is a 32–128px icon, and stretched near the full frame it would only look soft.
  return (
    <span className={cn(shell, rounded, className)} style={{ backgroundColor: background }}>
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className={cn('object-contain', source === 'favicon' ? 'h-[55%] w-[55%]' : 'h-[86%] w-[86%]')}
      />
    </span>
  );
}

export function Spinner({ className, label }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-8 text-sm text-ink-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 rounded-full bg-ink-100 p-3">
        <Icon className="h-6 w-6 text-ink-400" />
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-ink-800">{message || 'Something went wrong'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative z-10 w-full animate-fade-up rounded-xl bg-white shadow-pop', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto scroll-thin px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

 /**
 * A switch.
 *
 * The whole row is the control — previously the track was a <button> wrapped in
 * a <label>, which looked clickable but only responded on the track itself
 * (a label does not forward clicks to a nested button the way it does to an
 * input). One button also gives correct keyboard and screen-reader behaviour.
 *
 * Track 36x20, knob 16 inset 2px, so the travel is exactly 16px:
 *   off -> left 2px .. 18px      on -> left 18px .. 34px
 * The knob must be anchored with `left`; with only `top` set it falls back to
 * its static position inside the button and the transform pushes it clean off
 * the track, which is why it was invisible when switched on.
 */
export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={!label && !description ? 'Toggle' : undefined}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'group flex items-start gap-3 text-left focus:outline-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'relative mt-0.5 block h-5 w-9 shrink-0 rounded-full transition-colors',
          'group-focus-visible:ring-2 group-focus-visible:ring-brand-500/40 group-focus-visible:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-ink-300',
          !disabled && (checked ? 'group-hover:bg-brand-700' : 'group-hover:bg-ink-400')
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </span>

      {(label || description) && (
        <span className="text-sm">
          {label && <span className="font-medium text-ink-800">{label}</span>}
          {description && <span className="block text-xs text-ink-500">{description}</span>}
        </span>
      )}
    </button>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-ink-200', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700'
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]', value === t.value ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const STAT_CHIP_TONES = {
  indigo: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-blue-50 text-blue-600',
  gray: 'bg-ink-100 text-ink-600',
};

const STAT_INK_TONES = {
  indigo: 'text-brand-600',
  green: 'text-emerald-500',
  amber: 'text-amber-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
  gray: 'text-ink-400',
};

/**
 * `variant="hero"` is the airier treatment used by the dashboard's summary row:
 * muted label and a small bare icon on the top line, an oversized value and an
 * optional accent graphic on the bottom line, in an 18px-radius card.
 *
 * The default variant is unchanged, so the stat rows on Analytics, Customer and
 * Product pages keep the look they already have.
 */
export function StatCard({ label, value, sub, icon: Icon, tone = 'indigo', variant = 'plain', spark, sparkAs = 'line' }) {
  if (variant === 'hero') {
    return (
      <div className="flex min-h-[104px] flex-col justify-between rounded-[18px] border border-ink-200 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-xs font-medium text-ink-500">{label}</p>
          {Icon && <Icon className={cn('h-4 w-4 shrink-0', STAT_INK_TONES[tone] || STAT_INK_TONES.gray)} />}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="truncate text-3xl font-bold leading-none tracking-tight text-ink-900">{value}</p>
          {spark && <Sparkline points={spark} as={sparkAs} className={cn('shrink-0', STAT_INK_TONES[tone])} />}
        </div>
        {sub && <p className="mt-2 truncate text-xs text-ink-400">{sub}</p>}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-ink-500">{sub}</p>}
        </div>
        {Icon && (
          <div className={cn('rounded-lg p-2', STAT_CHIP_TONES[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Accent graphic for `StatCard`. Draws whatever series it is handed and takes its
 * colour from the parent via `currentColor`; it renders nothing without points,
 * so a card with no series to show simply has no graphic.
 */
function Sparkline({ points, as = 'line', className }) {
  if (!points?.length) return null;

  const W = 56;
  const H = 24;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const norm = (v) => (v - min) / span;

  if (as === 'bars') {
    const bar = W / (points.length * 1.7);
    const gap = (W - bar * points.length) / Math.max(points.length - 1, 1);
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" focusable="false">
        {points.map((v, i) => {
          const h = 3 + norm(v) * (H - 3);
          return (
            <rect key={i} x={i * (bar + gap)} y={H - h} width={bar} height={h} rx={bar / 2} fill="currentColor" />
          );
        })}
      </svg>
    );
  }

  // Quadratic through the midpoints — enough to read as a curve at this size.
  const pt = points.map((v, i) => [(i / Math.max(points.length - 1, 1)) * W, H - 2 - norm(v) * (H - 4)]);
  const d = pt.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pt[i - 1];
    return `${acc} Q${px},${py} ${(px + x) / 2},${(py + y) / 2}`;
  }, '') + ` L${pt[pt.length - 1][0]},${pt[pt.length - 1][1]}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const map = {
    info: { cls: 'border-blue-200 bg-blue-50 text-blue-800', Icon: Info },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
    warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertCircle },
    error: { cls: 'border-red-200 bg-red-50 text-red-800', Icon: AlertCircle },
  };
  const { cls, Icon } = map[tone] || map.info;
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', cls, className)} role="alert">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}

/** ● online / ◐ away / ○ offline — the exact vocabulary the spec asks for. */
export function PresenceDot({ status = 'offline', withLabel, lastSeen, className }) {
  const map = {
    online: { cls: 'bg-emerald-500', label: 'Online now', ring: 'ring-emerald-500/25' },
    away: { cls: 'bg-amber-400', label: 'Away', ring: 'ring-amber-400/25' },
    offline: { cls: 'bg-ink-300', label: lastSeen ? `Last seen ${lastSeen}` : 'Offline', ring: 'ring-ink-300/25' },
  };
  const s = map[status] || map.offline;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn('h-2 w-2 rounded-full ring-4', s.cls, s.ring, status === 'online' && 'animate-pulse-dot')}
        aria-hidden="true"
      />
      {withLabel && <span className="text-xs text-ink-500">{s.label}</span>}
    </span>
  );
}
