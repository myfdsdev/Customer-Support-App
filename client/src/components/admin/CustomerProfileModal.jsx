import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Phone, Globe, Clock, MessageSquare, Ticket as TicketIcon,
  Package, ExternalLink, Loader2, AlertCircle,
} from 'lucide-react';
import { customerService } from '../../services/endpoints';
import { Avatar, Modal, PresenceDot } from '../ui';
import { duration, fullTime, humanize, shortTime, timeAgo } from '../../utils/format';
import cn from '../../utils/cn';

/**
 * Who this person is, as a popup opened from the avatar beside their name.
 *
 * Deliberately read-only: identity, contact, live session and history. Editing
 * — tags, notes, purchase records — lives on the full profile page, one click
 * away, so this stays a glance rather than a form.
 *
 * Styled dark against the light admin surface: the shell comes from
 * `<Modal tone="dark">`, everything below is themed to match it.
 */
export default function CustomerProfileModal({ customerId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await customerService.get(customerId));
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load this profile');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Reload every time it opens — presence and tickets go stale quickly.
  useEffect(() => {
    if (!open) return;
    setData(null);
    load();
  }, [open, load]);

  const customer = data?.customer;
  const presence = data?.presence || {};
  const conversations = data?.conversations || [];
  const tickets = data?.tickets || [];

  // The live-session rows are all blank for anyone who is not on the site right
  // now — showing three em dashes says nothing, so the block only appears when
  // there is a session to describe.
  const liveSession = presence.product?.name || presence.currentPage || presence.durationSeconds;

  return (
    <Modal open={open} onClose={onClose} size="lg" tone="dark" title="Customer profile">
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-400" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading profile…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <p className="text-sm text-ink-200">{error}</p>
          <button
            onClick={load}
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-ink-700"
          >
            Try again
          </button>
        </div>
      ) : !customer ? null : (
        <div className="space-y-5">
          {/* Identity. The presence dot lives on the "Last seen" line only — an
              unlabelled second one on the avatar said the same thing twice. */}
          <div className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-800/60 p-3">
            {/* `cn` is clsx, not tailwind-merge, so overriding Avatar's own
                colours needs `!` to win rather than relying on class order. */}
            <Avatar
              name={customer.name || customer.email || 'Anonymous'}
              size="lg"
              className="!bg-brand-600 !text-ink-900"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-white">{customer.name || 'Anonymous visitor'}</p>
                {customer.status && <Chip>{humanize(customer.status)}</Chip>}
              </div>
              <div className="mt-0.5">
                <PresenceDot
                  status={presence.presenceStatus || 'offline'}
                  withLabel
                  labelClassName="text-ink-400"
                  lastSeen={timeAgo(presence.lastSeenAt || customer.lastSeenAt)}
                />
              </div>
              <Link
                to={`/admin/customers/${customer._id}`}
                onClick={onClose}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-400"
              >
                Full profile <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Facts run full width in two columns of rows — with only four of them
              a dedicated column would leave half the popup empty. */}
          <Section title="Details">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row icon={Mail} label="Email" value={customer.email} />
              <Row icon={Phone} label="Phone" value={customer.phone} />
              <Row icon={Clock} label="First seen" value={customer.firstSeenAt ? fullTime(customer.firstSeenAt) : null} />
              <Row icon={Clock} label="Last contact" value={customer.lastContactAt ? timeAgo(customer.lastContactAt) : null} />
            </div>
          </Section>

          {liveSession && (
            <Section title="Live session" icon={Globe}>
              <div className="grid gap-x-6 sm:grid-cols-2">
                <Row icon={Package} label="On product" value={presence.product?.name} />
                <Row
                  icon={Clock}
                  label="Duration"
                  value={presence.durationSeconds ? duration(presence.durationSeconds) : null}
                />
                <div className="sm:col-span-2">
                  <Row icon={Globe} label="Page" value={presence.currentPage} mono />
                </div>
              </div>
            </Section>
          )}

          {/* History, side by side */}
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Section title={`Conversations (${conversations.length})`} icon={MessageSquare}>
              {conversations.length === 0 ? (
                <Empty>This is their first conversation.</Empty>
              ) : (
                <div className="space-y-1.5">
                  {conversations.slice(0, 5).map((c) => (
                    <Link
                      key={c._id}
                      to={`/admin/inbox/${c._id}`}
                      onClick={onClose}
                      className="block rounded-lg border border-ink-700 bg-ink-800/40 p-2 transition-colors hover:border-brand-600"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px] font-medium text-ink-200">{c.productId?.name}</span>
                        <Chip tone={['resolved', 'closed'].includes(c.status) ? 'green' : 'gray'}>
                          {humanize(c.status)}
                        </Chip>
                        <span className="ml-auto shrink-0 text-[11px] text-ink-500">{shortTime(c.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{c.lastMessagePreview}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Tickets (${tickets.length})`} icon={TicketIcon}>
              {tickets.length === 0 ? (
                <Empty>No tickets.</Empty>
              ) : (
                <div className="space-y-1.5">
                  {tickets.slice(0, 5).map((t) => (
                    <Link
                      key={t._id}
                      to={`/admin/tickets/${t._id}`}
                      onClick={onClose}
                      className="block rounded-lg border border-ink-700 bg-ink-800/40 p-2 transition-colors hover:border-brand-600"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-ink-500">{t.ticketNumber}</span>
                        <Chip tone={['resolved', 'closed'].includes(t.status) ? 'green' : 'amber'} className="ml-auto">
                          {humanize(t.status)}
                        </Chip>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-ink-200">{t.title}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 border-b border-ink-800 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {Icon && <Icon className="h-3 w-3" />} {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
      <span className="w-20 shrink-0 text-xs text-ink-400">{label}</span>
      <span className={cn('min-w-0 flex-1 break-words text-xs text-ink-100', mono && 'font-mono')}>{value || '—'}</span>
    </div>
  );
}

const Empty = ({ children }) => <span className="text-xs text-ink-500">{children}</span>;

/** The shared Badge is built for light surfaces; these are its dark counterparts. */
const CHIP_TONES = {
  gray: 'border border-ink-700 bg-ink-800 text-ink-300',
  green: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
};

function Chip({ tone = 'gray', className, children }) {
  return <span className={cn('chip', CHIP_TONES[tone], className)}>{children}</span>;
}
