import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, MessageSquare, Inbox, Ticket, Bot, ChevronRight, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dashboardService } from '../../services/endpoints';
import { StatCard, Spinner, Badge, PresenceDot, Avatar, Alert, ProductLogo } from '../../components/ui';
import { shortTime, humanize } from '../../utils/format';
import cn from '../../utils/cn';

/**
 * ORNAMENT, NOT DATA.
 *
 * The summary cards carry a small accent graphic in the style of the reference
 * design. `/dashboard/stats` returns point-in-time counts with no history, so
 * there is no real series to plot and these shapes mean nothing — they are fixed
 * squiggles, identical on every load, and they never change with the numbers
 * beside them.
 *
 * They are deliberately wordless for that reason: a "+3.2%" chip would read as a
 * measured trend, which this would not be. If a time series ever becomes
 * available, pass it as `spark` and the accent turns into a real sparkline with
 * no other change. To drop the accents entirely, remove the `spark` props.
 */
const ACCENT = {
  customersOnline: [3, 5, 4, 7, 6, 9, 7, 8],
  activeChats: [4, 3, 6, 5, 8, 7, 10, 9],
  openTickets: [6, 4, 7, 5, 8, 6, 9, 7],
  aiResolution: [2, 4, 3, 6, 5, 8, 7, 9],
};

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
  const products = breakdown.map((row) => row.product);

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Customers online"
          value={live.customersOnline}
          icon={Users}
          tone="indigo"
          variant="hero"
          spark={ACCENT.customersOnline}
          sparkAs="bars"
        />
        <StatCard
          label="Active chats"
          value={live.activeConversations}
          icon={MessageSquare}
          tone="indigo"
          variant="hero"
          spark={ACCENT.activeChats}
        />
        <StatCard
          label="Open tickets"
          value={live.openTickets}
          icon={Ticket}
          tone="indigo"
          variant="hero"
          spark={ACCENT.openTickets}
          sparkAs="bars"
        />
        <StatCard
          label="AI resolution"
          value={`${analytics.aiResolutionRate}%`}
          icon={Bot}
          tone="indigo"
          variant="hero"
          spark={ACCENT.aiResolution}
        />
      </div>

      {/* Products — mark and name only. Per-product counts are on each product's page.
          `See more` moves up beside the heading so the row below stays a clean
          run of equally sized product tiles. */}
      <div className="mb-3 mt-6 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-900">Products</h2>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
        >
          See more <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        {products.length === 0 && (
          <p className="text-sm text-ink-500">No products yet. Create one to give it a support page.</p>
        )}
        {products.slice(0, 5).map((p) => (
          <ProductTile key={p._id} product={p} />
        ))}
      </div>

      {/* Team — same shape as Products above: a bare heading over a wrapping row of
          fixed-width tiles, with no card wrapped around the section itself. */}
      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink-900">Team online</h2>

      <div className="flex flex-wrap items-stretch gap-[14px]">
        {live.agentsOnline.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody is online right now — presence updates as the team signs in.</p>
        ) : (
          live.agentsOnline.map((a) => <TeamCard key={a._id} agent={a} />)
        )}
      </div>

      <Panel
        title="Recent conversations"
        action={<PanelLink to="/admin/inbox">View all</PanelLink>}
        className="mt-6"
      >
        {recent.conversations.length === 0 ? (
          <RowShell>
            <Row
              leading={<IconMark icon={MessageSquare} />}
              title="Nothing waiting"
              subtitle="New conversations arrive here in real time."
            />
          </RowShell>
        ) : (
          <div className="divide-y divide-ink-100">
            {recent.conversations.map((c) => (
              <RowShell key={c._id}>
                <ConversationRow conversation={c} />
              </RowShell>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Product tile: inset image on top, name and a link pill underneath.
 *
 * Two destinations in one card, so they cannot be nested anchors: the card body
 * keeps its existing navigation to the product's admin page via a stretched link,
 * and the pill — which opens the product's public support site — sits above it on
 * `z-10` so its own click wins.
 */
function ProductTile({ product }) {
  return (
    <div className="group relative flex w-[240px] max-w-full flex-col rounded-[18px] border border-ink-200 bg-white p-1.5 shadow-card transition-colors hover:border-brand-300">
      <ProductLogo
        product={product}
        rounded="rounded-[13px]"
        className="h-[108px] w-full"
        fallback={
          <span className="text-2xl font-bold tracking-tight text-white/90">
            {product.name.slice(0, 2).toUpperCase()}
          </span>
        }
      />

      <div className="flex items-center justify-between gap-2 px-1.5 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{product.name}</p>
        {product.slug && (
          <a
            href={`/support/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-ink-900 transition-colors hover:bg-brand-500"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <Link
        to={`/admin/products/${product._id}`}
        className="absolute inset-0 rounded-[18px]"
        aria-label={product.name}
      />
    </div>
  );
}

function Panel({ title, action, className, children }) {
  // 18px radius rather than the shared `.card` 12px, so these sit in the same
  // visual family as the hero stat cards above them.
  return (
    <div className={cn('rounded-[18px] border border-ink-200 bg-white shadow-card', className)}>
      <div className="flex h-12 items-center justify-between border-b border-ink-200 px-4">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

const PanelLink = ({ to, children }) => (
  <Link to={to} className="text-xs font-medium text-brand-700 hover:text-brand-800">
    {children}
  </Link>
);

/** The padding every panel row sits in. */
function RowShell({ children }) {
  return <div className="px-4 py-3">{children}</div>;
}

/** Leading mark, two lines, optional meta — the shape shared by every row. */
function Row({ leading, title, subtitle, meta, to }) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-medium text-ink-900">{title}</div>
        <div className="truncate text-xs text-ink-500">{subtitle}</div>
      </div>
      {meta && <div className="flex shrink-0 items-center gap-2">{meta}</div>}
    </>
  );

  return to ? (
    <Link to={to} className="flex items-center gap-3">
      {inner}
    </Link>
  ) : (
    <div className="flex items-center gap-3">{inner}</div>
  );
}

/** 32px, matching Avatar `sm`, so text columns line up across all three panels. */
const IconMark = ({ icon: Icon, tone = 'gray' }) => (
  <span
    className={cn(
      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
      tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-400'
    )}
  >
    <Icon className="h-4 w-4" />
  </span>
);

/* --- row bodies ----------------------------------------------------------- */

const customerName = (c) => c.customerId?.name || c.customerId?.email || 'Anonymous visitor';

function ConversationRow({ conversation: c }) {
  return (
    <Row
      to={`/admin/inbox/${c._id}`}
      leading={<Avatar name={customerName(c)} size="sm" />}
      title={
        <>
          <span className="truncate">{customerName(c)}</span>
          {c.productId?.name && <Badge tone="indigo">{c.productId.name}</Badge>}
        </>
      }
      subtitle={c.lastMessagePreview || 'No messages yet'}
      meta={
        // Status and assignment used to sit on a second band under the row. The
        // card now has the width to carry them on the row itself.
        <>
          {c.priority === 'urgent' && <Badge tone="red">Urgent</Badge>}
          <Badge tone="gray">{humanize(c.status)}</Badge>
          {c.assignedAgentId ? (
            <span className="hidden text-[11px] text-ink-400 sm:inline">{c.assignedAgentId.name}</span>
          ) : (
            <Badge tone="amber">Unassigned</Badge>
          )}
          <span className="w-14 text-right text-xs text-ink-400">{shortTime(c.lastMessageAt)}</span>
        </>
      }
    />
  );
}

/**
 * A teammate as a centred tile: avatar with its presence dot, name, role.
 *
 * The reference design carries a strip of social links along the bottom; agents
 * have no such field, so rather than invent one the presence dot does that work.
 */
function TeamCard({ agent: a }) {
  return (
    <div className="flex min-h-[88px] w-[240px] max-w-full items-center gap-[14px] rounded-2xl border border-ink-200 bg-white px-4 py-3.5 shadow-card">
      <div className="relative shrink-0">
        {/* 48px sits between Avatar's md and lg steps; `!` wins because `cn` is
            clsx, which concatenates rather than resolving class conflicts. */}
        <Avatar name={a.name} src={a.avatar} size="md" className="!h-12 !w-12" />
        <span className="absolute bottom-0 right-0 rounded-full bg-white p-[2px]">
          <PresenceDot status="online" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">{a.name}</p>
        <p className="truncate text-xs text-ink-500">{humanize(a.role)}</p>
      </div>
    </div>
  );
}

