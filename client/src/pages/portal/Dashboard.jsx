import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, RefreshCw, Package } from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button } from '../../components/ui';
import { portalService } from '../../services/portalApi';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { useLaunch } from '../../components/portal/useLaunch';

/** Local-time greeting. Falls back to a neutral one if the clock is unusable. */
function greeting() {
  const h = new Date().getHours();
  if (Number.isNaN(h)) return 'Welcome';
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

/* -------------------------------------------------------------------------
 * "Apps You'll Love" tiles
 * ---------------------------------------------------------------------- */

/** A single owned-app tile: logo, a "Purchased" badge, and an Open action. */
function AppTile({ product, onLaunch, launching }) {
  return (
    <div className="flex w-[330px] shrink-0 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card sm:w-[400px]">
      <Link to={product.productUrl} className="grid flex-1 place-items-center px-6 py-8">
        {product.logo ? (
          <img
            src={product.logo}
            alt={product.name}
            className="h-12 w-auto max-w-[300px] object-contain"
          />
        ) : (
          <span className="text-center text-xl font-semibold text-[#202328]">{product.name}</span>
        )}
      </Link>
      <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-sm font-normal text-[#202328]">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#8bd93c] text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
          </span>
          Purchased
        </span>
        {product.canLaunch ? (
          <button
            type="button"
            onClick={() => onLaunch(product)}
            disabled={launching}
            className="rounded-lg bg-[#0f1d01] px-6 py-2 text-base font-semibold text-white transition-colors hover:bg-[#1f3a0c] disabled:opacity-60"
          >
            {launching ? 'Opening…' : 'Open'}
          </button>
        ) : (
          <Link
            to={product.productUrl}
            className="rounded-lg bg-[#0f1d01] px-6 py-2 text-base font-semibold text-white transition-colors hover:bg-[#1f3a0c]"
          >
            View
          </Link>
        )}
      </div>
    </div>
  );
}

/** A faint placeholder slot, so the row stays balanced with only a few apps. */
function EmptyTile() {
  return (
    <div className="hidden w-[330px] shrink-0 rounded-2xl border border-brand-100 bg-brand-50/60 sm:block sm:w-[400px]" />
  );
}

/** Horizontal, arrow-controlled carousel of owned apps. */
function AppsCarousel({ products, onLaunch, launchingId }) {
  const scroller = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = () => {
    const el = scroller.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    if (!el) return undefined;
    const onResize = () => updateArrows();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [products.length]);

  const scrollByCards = (dir) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * 420, behavior: 'smooth' });
  };

  // Pad to at least three slots so a customer with one or two apps still sees
  // the balanced, three-across layout from the design.
  const pads = Math.max(0, 3 - products.length);

  return (
    <div className="flex items-stretch gap-2 sm:gap-3">
      <button
        type="button"
        aria-label="Previous apps"
        onClick={() => scrollByCards(-1)}
        disabled={atStart}
        className="grid w-6 shrink-0 place-items-center self-center rounded-full text-ink-400 transition-colors hover:text-ink-700 disabled:opacity-25 sm:w-8"
      >
        <ChevronLeft className="h-7 w-7" />
      </button>

      <div
        ref={scroller}
        onScroll={updateArrows}
        className="flex flex-1 gap-5 overflow-x-auto scroll-thin scroll-smooth pb-1"
      >
        {products.map((p) => (
          <AppTile key={p._id} product={p} onLaunch={onLaunch} launching={launchingId === p._id} />
        ))}
        {Array.from({ length: pads }).map((_, i) => (
          <EmptyTile key={`pad-${i}`} />
        ))}
      </div>

      <button
        type="button"
        aria-label="More apps"
        onClick={() => scrollByCards(1)}
        disabled={atEnd}
        className="grid w-6 shrink-0 place-items-center self-center rounded-full text-ink-600 transition-colors hover:text-ink-900 disabled:opacity-25 sm:w-8"
      >
        <ChevronRight className="h-7 w-7" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Dashboard
 * ---------------------------------------------------------------------- */
export default function Dashboard() {
  const { customer, refresh } = usePortalAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { launch, launchingId } = useLaunch();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await portalService.dashboard());
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefreshPurchases = async () => {
    setRefreshing(true);
    try {
      await portalService.refreshPurchases();
      await refresh();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading your dashboard…" />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { continueUsing, purchasedProducts = [] } = data || {};
  const hasProducts = purchasedProducts.length > 0;
  const primary = continueUsing || purchasedProducts[0] || null;

  const onHeroOpen = () => {
    if (primary?.canLaunch) launch(primary);
    else navigate('/portal/products');
  };

  const firstName = (customer?.firstName || customer?.name || 'there').toUpperCase();

  return (
    <div className="space-y-10 font-unbounded">
      {/* Greeting */}
      <div>
        <h1 className="text-[17px] font-normal text-[#111111]">
          {greeting()}, <span className="font-semibold text-brand-600">{firstName}</span>
        </h1>
        <span className="mt-2.5 inline-block rounded-full border border-ink-200 bg-ink-50 px-3.5 py-1 text-[11px] font-normal italic text-ink-600">
          Everything You Need, All In One Place
        </span>
      </div>

      {/* Hero banner */}
      <section className="overflow-hidden rounded-[28px] border border-ink-200 bg-white shadow-card">
        <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[minmax(0,460px)_1fr] md:items-center lg:gap-14">
          <div className="h-[220px] overflow-hidden rounded-3xl bg-[#04080f] md:h-[300px]">
            <img
              src="/images/brand/hero-crystal.png"
              alt="Fly Support hub"
              className="h-full w-full object-cover object-top"
            />
          </div>
          <div className="flex flex-col justify-center px-1 py-3 md:px-2">
            <h2 className="text-[36px] font-extrabold leading-[1.1] tracking-[-1px] text-[#0a0d02] md:text-[52px] md:tracking-[-1.5px]">
              One Hub for All Your Apps
            </h2>
            <p className="mt-4 text-[18px] font-medium leading-[1.35] text-[#727272] md:text-[22px]">Access, Support &amp; Stay Updated</p>
            <div className="mt-7">
              <button
                type="button"
                onClick={onHeroOpen}
                className="inline-flex h-[48px] w-[198px] items-center justify-center rounded-[15px] bg-gradient-to-b from-[#a9df1a] to-[#93c90e] text-[22px] font-normal text-white shadow-[0_14px_32px_-6px_rgba(160,214,20,0.85)] transition-all hover:from-[#b6ea27] hover:to-[#9bd216]"
              >
                Open App
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Apps You'll Love */}
      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-[28px] font-bold leading-[1.2] tracking-[-0.8px] text-[#202328] md:text-[36px]">Apps You&rsquo;ll Love</h2>
          {hasProducts && (
            <Link to="/portal/products" className="shrink-0 text-sm text-[#7e7f81] transition-colors hover:text-ink-700">
              See More…
            </Link>
          )}
        </div>

        {hasProducts ? (
          <AppsCarousel products={purchasedProducts} onLaunch={launch} launchingId={launchingId} />
        ) : (
          <div className="rounded-2xl border border-ink-200 bg-white shadow-card">
            <EmptyState
              icon={Package}
              title="No apps linked to this account yet"
              description="If you’ve purchased and don’t see it here, refresh your purchases or contact support."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={onRefreshPurchases} loading={refreshing} className="!font-semibold">
                    <RefreshCw className="h-4 w-4" /> Refresh purchases
                  </Button>
                  <Link to="/portal/support" className="btn-secondary !font-semibold">
                    Contact support
                  </Link>
                </div>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
