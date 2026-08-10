import React, { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { LifeBuoy, MessageSquare, GraduationCap, BookOpen, Home, Wifi, WifiOff } from 'lucide-react';
import { SupportProvider, useSupport } from '../context/SupportContext';
import { Spinner, ErrorState } from '../components/ui';
import cn from '../utils/cn';

function Shell() {
  const { product, loading, error, connected, productSlug } = useSupport();

  // Each product's own colour drives the page without a rebuild.
  useEffect(() => {
    if (product?.brandColor) document.documentElement.style.setProperty('--brand', product.brandColor);
    if (product?.name) document.title = `${product.name} Support`;
    return () => {
      document.title = 'Support Centre';
    };
  }, [product]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner label="Loading support centre…" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <ErrorState message={error || 'Support page not found'} />
          <p className="mt-2 text-sm text-ink-500">
            Check the support link you were given, or contact the team that sent it to you.
          </p>
        </div>
      </div>
    );
  }

  const nav = [
    { to: `/support/${productSlug}`, label: 'Home', icon: Home, end: true },
    { to: `/support/${productSlug}/chat`, label: 'Ask AI', icon: MessageSquare },
    { to: `/support/${productSlug}/training`, label: 'Training', icon: GraduationCap },
    { to: `/support/${productSlug}/help`, label: 'Help', icon: BookOpen },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to={`/support/${productSlug}`} className="flex min-w-0 items-center gap-2.5">
            {product.logo ? (
              <img src={product.logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ background: product.brandColor || '#4f46e5' }}
              >
                <LifeBuoy className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{product.name}</p>
              <p className="text-[11px] text-ink-500">Support Centre</p>
            </div>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <span
            className="ml-auto sm:ml-2"
            title={connected ? 'Connected to live support' : 'Reconnecting…'}
            aria-label={connected ? 'Connected' : 'Reconnecting'}
          >
            {connected ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-ink-300" />}
          </span>
        </div>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-ink-200 px-3 py-1.5 sm:hidden">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                  isActive ? 'bg-ink-100 text-ink-900' : 'text-ink-500'
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-ink-500">
          <p>© {new Date().getFullYear()} {product.name}</p>
          <div className="flex gap-4">
            {product.websiteUrl && (
              <a href={product.websiteUrl} target="_blank" rel="noreferrer" className="hover:text-ink-800">
                Website
              </a>
            )}
            {product.loginUrl && (
              <a href={product.loginUrl} target="_blank" rel="noreferrer" className="hover:text-ink-800">
                Sign in
              </a>
            )}
            {product.supportEmail && (
              <a href={`mailto:${product.supportEmail}`} className="hover:text-ink-800">
                {product.supportEmail}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SupportLayout() {
  const { productSlug } = useParams();
  // Remount the whole provider when the product changes so no state leaks
  // between two products' support pages.
  return (
    <SupportProvider key={productSlug}>
      <Shell />
    </SupportProvider>
  );
}
