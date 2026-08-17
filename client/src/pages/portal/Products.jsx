import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, RefreshCw } from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Button } from '../../components/ui';
import { portalService } from '../../services/portalApi';
import { PurchasedProductCard } from '../../components/portal/cards';
import { useLaunch } from '../../components/portal/useLaunch';

export default function Products() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { launch, launchingId } = useLaunch();

  const load = async () => {
    setError('');
    try {
      setProducts(await portalService.products());
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load your products.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await portalService.refreshPurchases();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!products) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading your products…" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">My Products</h1>
          <p className="mt-1 text-ink-500">Products linked to your account.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} loading={refreshing}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {products.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <PurchasedProductCard key={p._id} product={p} onLaunch={launch} launching={launchingId === p._id} />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={Package}
            title="No products linked to this account"
            description="Purchases made with this email will appear here automatically."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={onRefresh} loading={refreshing}>
                  <RefreshCw className="h-4 w-4" /> Refresh purchases
                </Button>
                <Link to="/portal/support" className="btn-secondary">
                  Contact support
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
