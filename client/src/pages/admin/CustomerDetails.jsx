import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save, MessageSquare, Ticket as TicketIcon, Package, StickyNote, Trash2, Plus } from 'lucide-react';
import { customerService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import {
  Spinner, Badge, Avatar, PresenceDot, Button, Input, Select, Textarea, Modal, StatCard, Tabs, EmptyState,
} from '../../components/ui';
import { timeAgo, fullTime, shortTime, duration, humanize } from '../../utils/format';

export default function CustomerDetails() {
  const { customerId } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('conversations');
  const [form, setForm] = useState({ name: '', email: '', phone: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [productModal, setProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ productId: '', plan: '', orderId: '', subscriptionStatus: 'active', credits: '', verified: true });

  const load = useCallback(async () => {
    const res = await customerService.get(customerId);
    setData(res);
    setForm({
      name: res.customer.name || '',
      email: res.customer.email || '',
      phone: res.customer.phone || '',
      status: res.customer.status || 'active',
    });
  }, [customerId]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => toast.error(err.friendlyMessage))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (loading || !data) return <Spinner className="py-24" />;

  const { customer, presence, conversations, tickets, products: owned, notes, sessions, issueCategories, stats } = data;

  async function save() {
    setSaving(true);
    try {
      await customerService.update(customerId, form);
      toast.success('Customer updated');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    try {
      await customerService.addNote(customerId, { note: note.trim() });
      setNote('');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  async function saveProduct() {
    if (!productForm.productId) return;
    try {
      await customerService.setProduct(customerId, productForm.productId, {
        plan: productForm.plan,
        orderId: productForm.orderId,
        subscriptionStatus: productForm.subscriptionStatus,
        credits: productForm.credits === '' ? undefined : Number(productForm.credits),
        verified: productForm.verified,
      });
      toast.success('Purchase record saved');
      setProductModal(false);
      setProductForm({ productId: '', plan: '', orderId: '', subscriptionStatus: 'active', credits: '', verified: true });
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  const tabs = [
    { value: 'conversations', label: 'Conversations', count: conversations.length },
    { value: 'tickets', label: 'Tickets', count: tickets.length },
    { value: 'products', label: 'Products', count: owned.length },
    { value: 'notes', label: 'Notes', count: notes.length },
    { value: 'sessions', label: 'Sessions', count: sessions.length },
  ];

  return (
    <div>
      <PageHeader title={customer.name || 'Anonymous visitor'} description={customer.email || 'No email captured'}>
        <Link to="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> All customers
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-3">
        {/* Left: profile */}
        <div className="space-y-4">
          <div className="card p-5 text-center">
            <div className="relative inline-block">
              <Avatar name={customer.name || customer.email || 'Anonymous'} size="lg" />
              <span className="absolute bottom-0 right-0 rounded-full bg-white p-0.5">
                <PresenceDot status={presence.presenceStatus} />
              </span>
            </div>
            <p className="mt-2 font-semibold text-ink-900">{customer.name || 'Anonymous visitor'}</p>
            <div className="mt-1">
              <PresenceDot status={presence.presenceStatus} withLabel lastSeen={timeAgo(presence.lastSeenAt || customer.lastSeenAt)} />
            </div>
            {presence.product && (
              <p className="mt-2 text-xs text-ink-500">
                On <strong>{presence.product.name}</strong>
                {presence.currentPage && <> · <code className="text-[11px]">{presence.currentPage}</code></>}
              </p>
            )}
            {presence.durationSeconds > 0 && (
              <p className="text-xs text-ink-400">Session {duration(presence.durationSeconds)}</p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Profile</h2>
            <div className="space-y-3">
              <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {['lead', 'active', 'churned', 'blocked'].map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </Select>
              <Button onClick={save} loading={saving} className="w-full">
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-xs text-ink-500">
              <p>First seen: {fullTime(customer.firstSeenAt)}</p>
              <p>Last contact: {customer.lastContactAt ? timeAgo(customer.lastContactAt) : '—'}</p>
              {issueCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {issueCategories.map((i) => (
                    <Badge key={i} tone="gray">{i}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: activity */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Conversations" value={stats.conversations} icon={MessageSquare} tone="indigo" />
            <StatCard label="Tickets" value={stats.tickets} icon={TicketIcon} tone="amber" />
            <StatCard label="AI resolved" value={stats.aiResolved} tone="green" />
            <StatCard label="Products" value={owned.length} icon={Package} tone="gray" />
          </div>

          <div className="card">
            <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-4 pt-1" />

            <div className="p-4">
              {tab === 'conversations' && (
                conversations.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="No conversations" />
                ) : (
                  <div className="space-y-2">
                    {conversations.map((c) => (
                      <Link
                        key={c._id}
                        to={`/admin/inbox/${c._id}`}
                        className="block rounded-lg border border-ink-200 p-3 transition-colors hover:border-brand-300"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="gray">{c.productId?.name}</Badge>
                          <Badge tone={['resolved', 'closed'].includes(c.status) ? 'green' : 'blue'}>{humanize(c.status)}</Badge>
                          {c.aiResolved && <Badge tone="indigo">AI resolved</Badge>}
                          {c.detectedIntent && <span className="text-[11px] text-ink-400">{c.detectedIntent}</span>}
                          <span className="ml-auto text-xs text-ink-400">{shortTime(c.lastMessageAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm text-ink-600">{c.lastMessagePreview}</p>
                      </Link>
                    ))}
                  </div>
                )
              )}

              {tab === 'tickets' && (
                tickets.length === 0 ? (
                  <EmptyState icon={TicketIcon} title="No tickets" />
                ) : (
                  <div className="space-y-2">
                    {tickets.map((t) => (
                      <Link
                        key={t._id}
                        to={`/admin/tickets/${t._id}`}
                        className="block rounded-lg border border-ink-200 p-3 transition-colors hover:border-brand-300"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-ink-400">{t.ticketNumber}</span>
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{t.title}</p>
                          <Badge tone={['resolved', 'closed'].includes(t.status) ? 'green' : 'amber'}>{humanize(t.status)}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">{t.productId?.name} · {t.category} · {shortTime(t.createdAt)}</p>
                      </Link>
                    ))}
                  </div>
                )
              )}

              {tab === 'products' && (
                <div>
                  <div className="mb-3 flex justify-end">
                    <Button size="sm" onClick={() => setProductModal(true)}>
                      <Plus className="h-4 w-4" /> Add purchase record
                    </Button>
                  </div>
                  {owned.length === 0 ? (
                    <EmptyState
                      icon={Package}
                      title="No verified purchase data"
                      description="Until a record exists here, the assistant will never state this customer's plan, credits or subscription status — it escalates instead."
                    />
                  ) : (
                    <div className="space-y-2">
                      {owned.map((p) => (
                        <div key={p._id} className="flex items-center gap-3 rounded-lg border border-ink-200 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink-900">{p.productId?.name}</p>
                            <p className="text-xs text-ink-500">
                              {p.plan || 'No plan'} · {humanize(p.subscriptionStatus)}
                              {typeof p.credits === 'number' && ` · ${p.credits} credits`}
                              {p.orderId && ` · ${p.orderId}`}
                            </p>
                          </div>
                          {p.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
                          <button
                            onClick={() =>
                              customerService
                                .removeProduct(customerId, p.productId?._id || p.productId)
                                .then(load)
                                .catch((e) => toast.error(e.friendlyMessage))
                            }
                            className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'notes' && (
                <div>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add an internal note…" />
                  <Button size="sm" className="mt-2" onClick={addNote} disabled={!note.trim()}>
                    <StickyNote className="h-4 w-4" /> Save note
                  </Button>
                  <div className="mt-4 space-y-2">
                    {notes.length === 0 && <p className="text-sm text-ink-400">No notes yet.</p>}
                    {notes.map((n) => (
                      <div key={n._id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm text-amber-900">{n.note}</p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-amber-700">
                          {n.agentName} · {timeAgo(n.createdAt)}
                          <button
                            onClick={() => customerService.deleteNote(customerId, n._id).then(load)}
                            className="ml-auto hover:text-red-600"
                          >
                            Delete
                          </button>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'sessions' && (
                sessions.length === 0 ? (
                  <EmptyState title="No sessions recorded" />
                ) : (
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div key={s._id} className="rounded-lg border border-ink-200 p-3">
                        <div className="flex items-center gap-2">
                          <PresenceDot status={s.endedAt ? 'offline' : s.presenceStatus} />
                          <p className="text-sm font-medium text-ink-800">{s.productId?.name}</p>
                          <span className="ml-auto text-xs text-ink-400">{shortTime(s.lastSeenAt)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {s.currentPage || '—'} · started {timeAgo(s.startedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={productModal}
        onClose={() => setProductModal(false)}
        title="Add verified purchase record"
        description="Only data recorded here may ever be quoted back to the customer by the AI."
        footer={
          <>
            <Button variant="ghost" onClick={() => setProductModal(false)}>Cancel</Button>
            <Button onClick={saveProduct} disabled={!productForm.productId}>Save record</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Product"
            value={productForm.productId}
            onChange={(e) => setProductForm((f) => ({ ...f, productId: e.target.value }))}
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Plan" value={productForm.plan} onChange={(e) => setProductForm((f) => ({ ...f, plan: e.target.value }))} placeholder="Pro" />
            <Input label="Order ID" value={productForm.orderId} onChange={(e) => setProductForm((f) => ({ ...f, orderId: e.target.value }))} />
            <Select
              label="Subscription"
              value={productForm.subscriptionStatus}
              onChange={(e) => setProductForm((f) => ({ ...f, subscriptionStatus: e.target.value }))}
            >
              {['none', 'trial', 'active', 'past_due', 'cancelled', 'expired', 'refunded'].map((s) => (
                <option key={s} value={s}>{humanize(s)}</option>
              ))}
            </Select>
            <Input
              label="Credits"
              type="number"
              value={productForm.credits}
              onChange={(e) => setProductForm((f) => ({ ...f, credits: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
