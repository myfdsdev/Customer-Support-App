import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Phone, Globe, Clock, Tag, StickyNote, MessageSquare, Ticket as TicketIcon,
  Package, Plus, ExternalLink, X,
} from 'lucide-react';
import { PresenceDot, Badge, Avatar, Button } from '../ui';
import { timeAgo, fullTime, duration, humanize, shortTime } from '../../utils/format';
import { customerService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';

/** Right-hand context column: who this person is and what they've dealt with. */
export default function CustomerPanel({ data, onRefresh }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  if (!data) return null;
  const { customer, customerPresence, previousConversations = [], tickets = [], products = [], conversation } = data;
  if (!customer) return null;

  const addNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await customerService.addNote(customer._id, { note: note.trim() });
      setNote('');
      toast.success('Note saved');
      onRefresh?.();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSavingNote(false);
    }
  };

  const addTag = async () => {
    const value = tag.trim();
    if (!value) return;
    try {
      await customerService.update(customer._id, { tags: [...new Set([...(customer.tags || []), value])] });
      setTag('');
      onRefresh?.();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  };

  const removeTag = async (t) => {
    try {
      await customerService.update(customer._id, { tags: (customer.tags || []).filter((x) => x !== t) });
      onRefresh?.();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  };

  const Row = ({ icon: Icon, label, value, mono }) => (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="w-20 shrink-0 text-xs text-ink-500">{label}</span>
      <span className={`min-w-0 flex-1 break-words text-xs text-ink-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto scroll-thin bg-white">
      {/* Identity */}
      <div className="border-b border-ink-200 p-4 text-center">
        <div className="relative inline-block">
          <Avatar name={customer.name || customer.email || 'Anonymous'} size="lg" />
          <span className="absolute bottom-0 right-0 rounded-full bg-white p-0.5">
            <PresenceDot status={customerPresence?.presenceStatus || 'offline'} />
          </span>
        </div>
        <p className="mt-2 font-semibold text-ink-900">{customer.name || 'Anonymous visitor'}</p>
        <p className="mt-0.5 text-xs">
          <PresenceDot
            status={customerPresence?.presenceStatus || 'offline'}
            withLabel
            lastSeen={timeAgo(customerPresence?.lastSeenAt || customer.lastSeenAt)}
          />
        </p>
        <Link
          to={`/admin/customers/${customer._id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Full profile <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Contact + session */}
      <section className="border-b border-ink-200 p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Details</h3>
        <Row icon={Mail} label="Email" value={customer.email} />
        <Row icon={Phone} label="Phone" value={customer.phone} />
        <Row icon={Package} label="Product" value={conversation?.productId?.name} />
        <Row icon={Globe} label="Page" value={customerPresence?.currentPage} mono />
        <Row
          icon={Clock}
          label="Session"
          value={customerPresence?.durationSeconds ? duration(customerPresence.durationSeconds) : '—'}
        />
        <Row icon={Clock} label="First seen" value={customer.firstSeenAt ? fullTime(customer.firstSeenAt) : '—'} />
        <Row icon={Clock} label="Last contact" value={customer.lastContactAt ? timeAgo(customer.lastContactAt) : '—'} />
      </section>

      {/* Tags */}
      <section className="border-b border-ink-200 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <Tag className="h-3 w-3" /> Tags
        </h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(customer.tags || []).length === 0 && <span className="text-xs text-ink-400">No tags</span>}
          {(customer.tags || []).map((t) => (
            <span key={t} className="chip bg-ink-100 text-ink-700">
              {t}
              <button onClick={() => removeTag(t)} className="text-ink-400 hover:text-red-500" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag"
            className="input !py-1 !text-xs"
          />
          <button onClick={addTag} className="btn-secondary !px-2 !py-1" aria-label="Add tag">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* Verified products */}
      <section className="border-b border-ink-200 p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Products used</h3>
        {products.length === 0 ? (
          <p className="text-xs text-ink-400">No verified purchase data.</p>
        ) : (
          <div className="space-y-1.5">
            {products.map((p) => (
              <div key={p._id} className="rounded-lg border border-ink-200 p-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">{p.productId?.name}</p>
                  {p.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  {p.plan || 'No plan'} · {humanize(p.subscriptionStatus)}
                  {typeof p.credits === 'number' && ` · ${p.credits} credits`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section className="border-b border-ink-200 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <MessageSquare className="h-3 w-3" /> Previous conversations ({previousConversations.length})
        </h3>
        {previousConversations.length === 0 ? (
          <p className="text-xs text-ink-400">This is their first conversation.</p>
        ) : (
          <div className="space-y-1.5">
            {previousConversations.slice(0, 5).map((c) => (
              <Link
                key={c._id}
                to={`/admin/inbox/${c._id}`}
                className="block rounded-lg border border-ink-200 p-2 transition-colors hover:border-brand-300"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[11px] font-medium text-ink-700">{c.productId?.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-400">{shortTime(c.lastMessageAt)}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-600">{c.lastMessagePreview}</p>
                <Badge tone={['resolved', 'closed'].includes(c.status) ? 'green' : 'gray'} className="mt-1">
                  {humanize(c.status)}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Tickets */}
      <section className="border-b border-ink-200 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <TicketIcon className="h-3 w-3" /> Tickets ({tickets.length})
        </h3>
        {tickets.length === 0 ? (
          <p className="text-xs text-ink-400">No tickets.</p>
        ) : (
          <div className="space-y-1.5">
            {tickets.slice(0, 5).map((t) => (
              <Link
                key={t._id}
                to={`/admin/tickets/${t._id}`}
                className="block rounded-lg border border-ink-200 p-2 transition-colors hover:border-brand-300"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-ink-400">{t.ticketNumber}</span>
                  <Badge tone={['resolved', 'closed'].includes(t.status) ? 'green' : 'amber'} className="ml-auto">
                    {humanize(t.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-700">{t.title}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <StickyNote className="h-3 w-3" /> Notes
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Add a note about this customer…"
          className="input !text-xs"
        />
        <Button size="sm" className="mt-2 w-full" onClick={addNote} loading={savingNote} disabled={!note.trim()}>
          Save note
        </Button>
      </section>
    </div>
  );
}
