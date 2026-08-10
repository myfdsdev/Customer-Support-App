import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { customerService, productService } from '../../services/endpoints';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import { Spinner, EmptyState, Badge, Avatar, PresenceDot, Select } from '../../components/ui';
import { timeAgo, shortTime } from '../../utils/format';

export default function Customers() {
  const { socket } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [presence, setPresence] = useState('');

  const load = useCallback(async () => {
    const res = await customerService.list({
      search: search || undefined,
      productId: productId || undefined,
      presence: presence || undefined,
      limit: 100,
    });
    setCustomers(res.data || []);
    setLoading(false);
  }, [search, productId, presence]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Presence changes constantly; refresh the list rather than patching rows.
  useEffect(() => {
    if (!socket) return undefined;
    const handler = () => load();
    socket.on('presence:update', handler);
    socket.on('customer:updated', handler);
    return () => {
      socket.off('presence:update', handler);
      socket.off('customer:updated', handler);
    };
  }, [socket, load]);

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has used a support page, across every product.">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or phone…"
              className="input pl-8"
              aria-label="Search customers"
            />
          </div>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
          <Select value={presence} onChange={(e) => setPresence(e.target.value)} aria-label="Filter by presence">
            <option value="">Any presence</option>
            <option value="online">Online</option>
            <option value="away">Away</option>
            <option value="offline">Offline</option>
          </Select>
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers found" description="Customers appear here the moment they open a support page." />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Presence</th>
                    <th className="px-4 py-2.5 font-semibold">Chats</th>
                    <th className="px-4 py-2.5 font-semibold">Tickets</th>
                    <th className="px-4 py-2.5 font-semibold">Tags</th>
                    <th className="px-4 py-2.5 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {customers.map((c) => (
                    <tr key={c._id} className="hover:bg-ink-50">
                      <td className="px-4 py-2.5">
                        <Link to={`/admin/customers/${c._id}`} className="flex items-center gap-2.5">
                          <Avatar name={c.name || c.email || 'Anonymous'} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink-900">{c.name || 'Anonymous visitor'}</span>
                            <span className="block truncate text-xs text-ink-500">{c.email || 'No email captured'}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <PresenceDot status={c.presenceStatus} withLabel lastSeen={timeAgo(c.lastSeenAt)} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{c.stats?.conversations || 0}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{c.stats?.tickets || 0}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).slice(0, 3).map((t) => (
                            <Badge key={t} tone="gray">{t}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-400">{shortTime(c.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
