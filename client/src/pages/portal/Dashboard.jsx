import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Users, Package, RefreshCw, Sparkles } from 'lucide-react';
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

function Section({ title, action, children }) {
  return (
    <section className="mt-8">
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
    dashboardCards = [],
  } = data || {};

  const hasProducts = purchasedProducts.length > 0;

  return (
    <div>
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">
          {greeting()}, {customer?.firstName || 'there'}
        </h1>
        <p className="mt-1 text-ink-500">Everything you need, all in one place.</p>
      </div>

      {/* Featured marketing cards (clearly labelled) */}
      {dashboardCards.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {dashboardCards.map((c) => (
            <RecommendationCard key={c._id} item={c} onClick={trackRec} />
          ))}
        </div>
      )}

      {/* Continue where you left off */}
      {continueUsing && (
        <div className="mt-6">
          <ContinueProductCard product={continueUsing} onLaunch={launch} launching={launchingId === continueUsing._id} />
        </div>
      )}

      {/* Your Apps */}
      <Section
        title="Your Apps"
        action={
          <Button variant="ghost" size="sm" onClick={onRefreshPurchases} loading={refreshing}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      >
        {hasProducts ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {purchasedProducts.map((p) => (
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
                <Link to="/portal/support" className="btn-secondary">
                  Contact support
                </Link>
              </div>
            }
          />
        )}
      </Section>

      {/* Discovery (admin-approved) */}
      {!hasProducts && discoveryProducts.length > 0 && (
        <Section title="Explore">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {discoveryProducts.map((p) => (
              <PurchasedProductCard key={p._id} product={p} onLaunch={launch} launching={false} />
            ))}
          </div>
        </Section>
      )}

      {/* Need help */}
      <Section title="Need help?">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/portal/support" className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-pop">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-100 text-ink-700">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-ink-900">Chat with AI</p>
              <p className="text-sm text-ink-500">Instant answers about your products.</p>
            </div>
          </Link>
          <Link to="/portal/support" className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-pop">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-ink-900">Chat with Our Team</p>
              <p className="text-sm text-ink-500">Talk to a real person on our support team.</p>
            </div>
          </Link>
        </div>
      </Section>

      {/* What's New */}
      {announcements.length > 0 && (
        <Section title="What’s New">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {announcements.map((a) => (
              <AnnouncementCard key={a._id} item={a} />
            ))}
          </div>
        </Section>
      )}

      {/* Recommended for you */}
      {recommendations.length > 0 && (
        <Section
          title="Recommended for you"
          action={
            <span className="inline-flex items-center gap-1 text-xs text-ink-400">
              <Sparkles className="h-3.5 w-3.5" /> Sponsored suggestions
            </span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((r) => (
              <RecommendationCard key={r._id} item={r} onClick={trackRec} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
