import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LifeBuoy, Paperclip, Plus, Ticket as TicketIcon } from 'lucide-react';
import {
  Spinner,
  ErrorState,
  EmptyState,
  Badge,
  Button,
  Input,
  Textarea,
  Select,
  Alert,
} from '../../components/ui';
import { portalService } from '../../services/portalApi';
import { fullTime, timeAgo } from '../../utils/format';
import cn from '../../utils/cn';

/**
 * The customer's view of their support tickets — read-only by design. The one
 * question this page exists to answer is "has my problem been solved?", so the
 * status leads on both screens rather than hiding in a metadata row.
 *
 * Wording is customer-facing: our internal column names ("waiting_team") are
 * translated into what they mean for the person waiting.
 */
const STATUS_META = {
  open: {
    label: 'Open',
    tone: 'amber',
    panel: 'border-amber-200 bg-amber-50',
    headline: 'We have received your ticket',
    blurb: 'Our team will pick this up shortly.',
  },
  in_progress: {
    label: 'In progress',
    tone: 'blue',
    panel: 'border-blue-200 bg-blue-50',
    headline: 'We are working on it',
    blurb: 'Someone from our team is on this right now.',
  },
  waiting_customer: {
    label: 'Needs your reply',
    tone: 'purple',
    panel: 'border-purple-200 bg-purple-50',
    headline: 'We need a reply from you',
    blurb: 'We cannot move this forward until you get back to us.',
  },
  waiting_team: {
    label: 'With our team',
    tone: 'gray',
    panel: 'border-ink-200 bg-ink-50',
    headline: 'Passed to a specialist',
    blurb: 'Your ticket is queued with the team that can fix it.',
  },
  resolved: {
    label: 'Resolved',
    tone: 'green',
    panel: 'border-emerald-200 bg-emerald-50',
    headline: 'Your issue has been resolved',
    blurb: 'If this is not fixed for you, start a conversation and we will reopen it.',
  },
  closed: {
    label: 'Closed',
    tone: 'gray',
    panel: 'border-ink-200 bg-ink-50',
    headline: 'This ticket is closed',
    blurb: 'Start a new conversation if you need more help.',
  },
};

const PRIORITY_TONE = { low: 'gray', normal: 'blue', high: 'amber', urgent: 'red' };

const metaFor = (status) => STATUS_META[status] || STATUS_META.open;

/* ------------------------------------------------------------------------ */

export default function Tickets() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    try {
      setItems(await portalService.tickets());
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load your tickets.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading your tickets…" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Support tickets</h1>
          <p className="mt-1 text-ink-500">Issues our team is tracking for you, and where each one stands.</p>
        </div>
        <Button onClick={() => navigate('/portal/tickets/new')}>
          <Plus className="h-4 w-4" /> New ticket
        </Button>
      </div>

      {items.length ? (
        <div className="mt-6 space-y-2">
          {items.map((t) => {
            const meta = metaFor(t.status);
            return (
              <button
                key={t._id}
                type="button"
                onClick={() => navigate(`/portal/tickets/${t._id}`)}
                className="flex w-full items-start gap-4 rounded-xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-300 hover:bg-ink-50"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <TicketIcon className="h-[18px] w-[18px]" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-400">{t.ticketNumber}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="mt-1 truncate font-medium text-ink-900">{t.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {t.product?.name || 'General'} · opened {timeAgo(t.createdAt)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={TicketIcon}
            title="No tickets yet"
            description="Raise a ticket for anything that needs our team, and follow its progress here."
            action={<Button onClick={() => navigate('/portal/tickets/new')}>Open a ticket</Button>}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export function TicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    try {
      setTicket(await portalService.ticket(id));
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load this ticket.');
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!ticket) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading ticket…" />
      </div>
    );
  }

  const meta = metaFor(ticket.status);

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/portal/tickets')}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" /> All tickets
      </button>

      {/* The answer to "is it solved?", stated before anything else. */}
      <div className={cn('mt-4 rounded-xl border p-5', meta.panel)}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="font-mono text-xs text-ink-500">{ticket.ticketNumber}</span>
        </div>
        <p className="mt-2 text-lg font-semibold text-ink-900">{meta.headline}</p>
        <p className="mt-1 text-sm text-ink-600">{meta.blurb}</p>
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-ink-900">{ticket.title}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
        <span>{ticket.product?.name || 'General'}</span>
        <span aria-hidden="true">·</span>
        <span>{ticket.category}</span>
        <span aria-hidden="true">·</span>
        <Badge tone={PRIORITY_TONE[ticket.priority] || 'gray'}>{ticket.priority} priority</Badge>
      </div>

      {ticket.description ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink-900">What you reported</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{ticket.description}</p>
        </section>
      ) : null}

      {ticket.resolution ? (
        <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-sm font-semibold text-emerald-900">How we resolved it</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-emerald-900/90">{ticket.resolution}</p>
        </section>
      ) : null}

      {ticket.attachments?.length ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink-900">Attachments</h2>
          <ul className="mt-2 space-y-1.5">
            {ticket.attachments.map((a) => (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-brand-700 hover:underline"
                >
                  <Paperclip className="h-4 w-4" /> {a.name || 'Attachment'}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-ink-900">Timeline</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Opened" value={fullTime(ticket.createdAt)} />
          {ticket.agent?.name ? <Row label="Handled by" value={ticket.agent.name} /> : null}
          {ticket.resolvedAt ? <Row label="Resolved" value={fullTime(ticket.resolvedAt)} /> : null}
          {ticket.closedAt ? <Row label="Closed" value={fullTime(ticket.closedAt)} /> : null}
          <Row label="Last updated" value={timeAgo(ticket.updatedAt)} />
        </dl>
      </section>

      <div className="mt-6">
        <Button variant="secondary" onClick={() => navigate('/portal/support')}>
          <LifeBuoy className="mr-2 h-4 w-4" /> Still need help?
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Raise a ticket.
 *
 * The product list comes from the customer's own entitlements, so the dropdown
 * can only ever offer something they actually own — the server enforces the
 * same rule, this just avoids offering a choice that would be rejected.
 *
 * Priority is absent on purpose: the team sets it during triage.
 */
export function NewTicket() {
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ productSlug: '', category: 'Other', title: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoadError('');
    try {
      const data = await portalService.supportProducts();
      setMeta(data);
      setForm((f) => ({ ...f, productSlug: f.productSlug || data.products?.[0]?.slug || '' }));
    } catch (err) {
      setLoadError(err.friendlyMessage || 'Could not load your products.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.productSlug || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const ticket = await portalService.createTicket(form.productSlug, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
      });
      navigate(`/portal/tickets/${ticket._id}`, { replace: true });
    } catch (err) {
      setError(err.friendlyMessage || 'Could not open your ticket. Please try again.');
      setSubmitting(false);
    }
  };

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!meta) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  const products = meta.products || [];

  return (
    <div className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={() => navigate('/portal/tickets')}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" /> All tickets
      </button>

      <h1 className="mt-4 text-2xl font-semibold text-ink-900">Open a ticket</h1>
      <p className="mt-1 text-ink-500">
        Tell us what is wrong and we will route it to the right person on our team.
      </p>

      {products.length ? (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Select label="Product" value={form.productSlug} onChange={set('productSlug')} required>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>

          <Select label="What is this about?" value={form.category} onChange={set('category')}>
            {(meta.ticketCategories || ['Other']).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Input
            label="Title"
            value={form.title}
            onChange={set('title')}
            maxLength={200}
            required
            placeholder="Export button does nothing"
            hint="One line describing the problem."
          />

          <Textarea
            label="Details"
            value={form.description}
            onChange={set('description')}
            rows={6}
            maxLength={10000}
            placeholder="What did you try, what did you expect, and what happened instead?"
            hint="The more detail you give, the faster we can fix it."
          />

          {error ? <Alert tone="error" title="Could not open the ticket">{error}</Alert> : null}

          <div className="flex items-center gap-2">
            <Button type="submit" loading={submitting} disabled={!form.title.trim()}>
              Open ticket
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/portal/tickets')}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={TicketIcon}
            title="No products to raise a ticket for"
            description="Tickets are raised against a product you own. Once a purchase is active on your account, you can open one here."
            action={<Button onClick={() => navigate('/portal/products')}>View my products</Button>}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-800">{value}</dd>
    </div>
  );
}
