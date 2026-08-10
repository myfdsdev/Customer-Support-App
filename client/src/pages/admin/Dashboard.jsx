import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, MessageSquare, Inbox, Ticket, Package, UserCheck, Timer, CheckCircle2,
  Bot, ArrowUpRight, Sparkles, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dashboardService } from '../../services/endpoints';
import { StatCard, Spinner, Badge, PresenceDot, Avatar, EmptyState, Alert } from '../../components/ui';
import { duration, shortTime, humanize } from '../../utils/format';

export default function Dashboard() {
  const { socket, user } = useAuth();
  const [data, setData] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [recent, setRecent] = useState({ conversations: [], tickets: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [stats, bd, rc] = await Promise.all([
      dashboardService.stats(),
      dashboardService.breakdown(),
      dashboardService.recent(),
    ]);
    setData(stats);
    setBreakdown(bd);
    setRecent(rc);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Live events beat the 30s poll for anything the team is waiting on.
  useEffect(() => {
    if (!socket) return undefined;
    const events = ['conversation:new', 'conversation:handoff', 'conversation:resolved', 'presence:update'];
    const handler = () => load();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket, load]);

  if (loading) return <Spinner className="py-24" label="Loading dashboard…" />;

  const { live, analytics, system } = data;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">Good to see you, {user?.name?.split(' ')[0]}</h1>
          <p className="mt-0.5 text-sm text-ink-500">Support activity across all products.</p>
        </div>
        <Link to="/admin/inbox" className="btn-primary">
          <Inbox className="h-4 w-4" /> Open inbox
        </Link>
      </div>

      {!system.geminiEnabled && (
        <Alert tone="warning" title="Gemini is not configured" className="mb-5">
          The assistant is running on keyword retrieval with extractive answers. Add <code>GEMINI_API_KEY</code> to{' '}
          <code>server/.env</code> and run <code>npm run reindex</code> to enable generated answers and semantic search.
        </Alert>
      )}

      {/* Live counters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Customers online" value={live.customersOnline} icon={Users} tone="green" />
        <StatCard label="Active chats" value={live.activeConversations} icon={MessageSquare} tone="indigo" />
        <StatCard label="Unassigned" value={live.unassignedConversations} icon={Inbox} tone={live.unassignedConversations ? 'amber' : 'gray'} />
        <StatCard label="Open tickets" value={live.openTickets} icon={Ticket} tone="blue" />
        <StatCard label="Total customers" value={live.totalCustomers} icon={UserCheck} tone="gray" />
        <StatCard label="Products" value={live.totalProducts} icon={Package} tone="gray" />
      </div>

      {/* Support quality */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Avg response"
          value={analytics.avgResponseTimeSeconds ? duration(analytics.avgResponseTimeSeconds) : '—'}
          sub="First agent reply"
          icon={Timer}
          tone="blue"
        />
        <StatCard
          label="Avg resolution"
          value={analytics.avgResolutionTimeSeconds ? duration(analytics.avgResolutionTimeSeconds) : '—'}
          sub={`Last ${analytics.rangeDays} days`}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard label="AI resolution" value={`${analytics.aiResolutionRate}%`} sub="Solved without a human" icon={Bot} tone="indigo" />
        <StatCard label="Human resolution" value={`${analytics.humanResolutionRate}%`} icon={UserCheck} tone="gray" />
        <StatCard label="Escalation rate" value={`${analytics.escalationRate}%`} sub="Handed to the team" icon={ArrowUpRight} tone={analytics.escalationRate > 50 ? 'amber' : 'gray'} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Product breakdown */}
        <div className="card lg:col-span-2">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">By product</h2>
          </div>
          <div className="divide-y divide-ink-100">
            {breakdown.length === 0 && <EmptyState icon={Package} title="No products yet" description="Create a product to give it a support page." />}
            {breakdown.map((row) => (
              <Link
                key={row.product._id}
                to={`/admin/products/${row.product._id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: row.product.brandColor || '#4f46e5' }}
                >
                  {row.product.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{row.product.name}</p>
                  <p className="truncate text-xs text-ink-500">/support/{row.product.slug}</p>
                </div>
                <div className="hidden gap-6 text-right sm:flex">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{row.conversations}</p>
                    <p className="text-[11px] text-ink-500">chats</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{row.open}</p>
                    <p className="text-[11px] text-ink-500">open</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">{row.aiResolutionRate}%</p>
                    <p className="text-[11px] text-ink-500">AI solved</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Agents online */}
        <div className="card">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Team online</h2>
          </div>
          <div className="divide-y divide-ink-100">
            {live.agentsOnline.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Nobody is online right now.</p>
            )}
            {live.agentsOnline.map((a) => (
              <div key={a._id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={a.name} src={a.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{a.name}</p>
                  <p className="text-xs text-ink-500">{humanize(a.role)}</p>
                </div>
                <PresenceDot status="online" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Recent conversations */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Recent conversations</h2>
            <Link to="/admin/inbox" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View inbox
            </Link>
          </div>
          <div className="divide-y divide-ink-100">
            {recent.conversations.length === 0 && (
              <EmptyState icon={MessageSquare} title="Nothing waiting" description="New conversations will appear here in real time." />
            )}
            {recent.conversations.map((c) => (
              <Link key={c._id} to={`/admin/inbox/${c._id}`} className="block px-4 py-3 transition-colors hover:bg-ink-50">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {c.customerId?.name || c.customerId?.email || 'Anonymous visitor'}
                  </p>
                  <Badge tone="gray">{c.productId?.name}</Badge>
                  {!c.assignedAgentId && <Badge tone="amber">Unassigned</Badge>}
                  {c.priority === 'urgent' && <Badge tone="red">Urgent</Badge>}
                  <span className="ml-auto shrink-0 text-xs text-ink-400">{shortTime(c.lastMessageAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">{c.lastMessagePreview || 'No messages yet'}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Tickets needing attention */}
        <div className="card">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Tickets needing attention</h2>
            <Link to="/admin/tickets" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              All tickets
            </Link>
          </div>
          <div className="divide-y divide-ink-100">
            {recent.tickets.length === 0 && (
              <EmptyState icon={Sparkles} title="No open tickets" description="Tickets are only created when something needs investigation." />
            )}
            {recent.tickets.map((t) => (
              <Link key={t._id} to={`/admin/tickets/${t._id}`} className="block px-4 py-3 transition-colors hover:bg-ink-50">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-400">{t.ticketNumber}</span>
                  <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                  <Badge tone={t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'amber' : 'gray'} className="ml-auto shrink-0">
                    {t.priority}
                  </Badge>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  <AlertCircle className="h-3 w-3" />
                  {humanize(t.status)} · {t.productId?.name}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
