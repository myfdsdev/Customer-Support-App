import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Headphones, Package, RefreshCw, ArrowRight, ShieldCheck } from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button } from '../../components/ui';
import { portalService } from '../../services/portalApi';
import { usePortalAuth } from '../../context/PortalAuthContext';
import {
  ContinueProductCard,
  PurchasedProductCard,
  RecommendationCard,
  AnnouncementCard,
} from '../../components/portal/cards';
import { useLaunch } from '../../components/portal/useLaunch';

/** Local-time greeting. Falls back to a neutral one if the clock is unusable. */
function greeting() {
  const h = new Date().getHours();
  if (Number.isNaN(h)) return 'Welcome';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Section wrapper with a title and an optional right-aligned action. */
function Panel({ title, action, children, className }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { customer, refresh } = usePortalAuth();
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

  // Impressions are tracked server-side when the dashboard is rendered; there
  // is no customer-facing click endpoint, so a click is a plain navigation.
  const trackRec = () => {};

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading your dashboard…" />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const {
    continueUsing,
    purchasedProducts = [],
    discoveryProducts = [],
    recommendations = [],
    announcements = [],
  } = data || {};

  const hasProducts = purchasedProducts.length > 0;
  // Cap the "Your Apps" grid at three, matching the wireframe; the rest live
  // behind "See all apps".
  const appsPreview = purchasedProducts.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">
          {greeting()}, {customer?.firstName || 'there'} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-ink-500">Everything you need, all in one place.</p>
      </div>

      {/* Continue where you left off */}
      {continueUsing && (
        <ContinueProductCard product={continueUsing} onLaunch={launch} launching={launchingId === continueUsing._id} />
      )}

      {/* Your Apps (2/3) + Need Help (1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Your Apps"
          action={
            hasProducts && (
              <Link to="/portal/products" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                See all apps <ArrowRight className="h-4 w-4" />
              </Link>
            )
          }
        >
          {hasProducts ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {appsPreview.map((p) => (
                <PurchasedProductCard key={p._id} product={p} onLaunch={launch} launching={launchingId === p._id} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Package}
              title="No products linked to this account"
              description="If you’ve purchased and don’t see it here, refresh your purchases or contact support."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={onRefreshPurchases} loading={refreshing}>
                    <RefreshCw className="h-4 w-4" /> Refresh purchases
                  </Button>
                  <Link to="/portal/support" className="btn-secondary">Contact support</Link>
                </div>
              }
            />
          )}
        </Panel>

        {/* Need Help */}
        <Panel title="Need Help?">
          <div className="card flex h-[calc(100%-2.25rem)] flex-col items-center p-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Headphones className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm text-ink-600">Chat with our team or find a quick answer.</p>
            <div className="mt-4 flex w-full flex-col gap-2">
              <Link to="/portal/support" className="btn-primary justify-center">Get Support</Link>
              <Link to="/portal/conversations" className="btn-secondary justify-center">Browse conversations</Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Discovery products for customers with nothing purchased yet */}
      {!hasProducts && discoveryProducts.length > 0 && (
        <Panel title="Explore">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {discoveryProducts.map((p) => (
              <PurchasedProductCard key={p._id} product={p} onLaunch={launch} launching={false} />
            ))}
          </div>
        </Panel>
      )}

      {/* What's New (1/2) + Recommended (1/2) */}
      {(announcements.length > 0 || recommendations.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {announcements.length > 0 && (
            <Panel title="What’s New">
              <div className="grid gap-4 sm:grid-cols-2">
                {announcements.slice(0, 2).map((a) => (
                  <AnnouncementCard key={a._id} item={a} />
                ))}
              </div>
            </Panel>
          )}

          {recommendations.length > 0 && (
            <Panel title="Recommended for You">
              <div className="grid gap-4 sm:grid-cols-2">
                {recommendations.slice(0, 2).map((r) => (
                  <RecommendationCard key={r._id} item={r} onClick={trackRec} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* Trust strip */}
      <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600">
        <ShieldCheck className="h-5 w-5 text-brand-600" />
        Your purchases are protected and linked to your account.
      </div>
    </div>
  );
}
