import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Ticket as TicketIcon, Search, ArrowLeft, Save, MessageSquare, StickyNote } from 'lucide-react';
import { ticketService, productService, customerService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Select, Modal, Badge, Spinner, EmptyState } from '../../components/ui';
import { shortTime, timeAgo, humanize } from '../../utils/format';

const STATUS_TONE = {
  open: 'blue',
  in_progress: 'indigo',
  waiting_customer: 'gray',
  waiting_team: 'amber',
  resolved: 'green',
  closed: 'gray',
};
const PRIORITY_TONE = { urgent: 'red', high: 'amber', normal: 'gray', low: 'gray' };

/* ---------------------------------------------------------------------- */

export function TicketDetails() {
  const { ticketId } = useParams();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    const t = await ticketService.get(ticketId);
    setTicket(t);
    setForm({
      status: t.status,
      priority: t.priority,
      category: t.category,
      assignedTeam: t.assignedTeam || '',
      assignedAgent: t.assignedAgent?._id || '',
      resolution: t.resolution || '',
    });
  }, [ticketId]);

  useEffect(() => {
    Promise.all([load(), ticketService.meta().then(setMeta)])
      .catch((err) => toast.error(err.friendlyMessage))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  if (loading || !ticket) return <Spinner className="py-24" />;

  async function save() {
    setSaving(true);
    try {
      await ticketService.update(ticketId, form);
      toast.success('Ticket updated');
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
      await ticketService.addNote(ticketId, note.trim());
      setNote('');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div>
      <PageHeader
        title={ticket.title}
        description={`${ticket.ticketNumber} · ${ticket.productId?.name} · opened ${timeAgo(ticket.createdAt)}`}
        actions={<Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save</Button>}
      >
        <Link to="/admin/tickets" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> All tickets
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-ink-700">{ticket.description || 'No description provided.'}</p>
          </div>

          {ticket.conversationId && (
            <Link
              to={`/admin/inbox/${ticket.conversationId._id || ticket.conversationId}`}
              className="card flex items-center gap-3 p-4 transition-colors hover:border-brand-300"
            >
              <MessageSquare className="h-5 w-5 text-brand-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">Open the original conversation</p>
                <p className="truncate text-xs text-ink-500">{ticket.conversationId.lastMessagePreview}</p>
              </div>
            </Link>
          )}

          <div className="card p-5">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <StickyNote className="h-4 w-4" /> Internal notes
            </h2>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a note for the team…" />
            <Button size="sm" className="mt-2" onClick={addNote} disabled={!note.trim()}>Add note</Button>
            <div className="mt-4 space-y-2">
              {(ticket.notes || []).length === 0 && <p className="text-sm text-ink-400">No notes yet.</p>}
              {(ticket.notes || []).map((n, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-900">{n.note}</p>
                  <p className="mt-1 text-[11px] text-amber-700">{n.agentName} · {timeAgo(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Ticket</h2>
            <div className="space-y-3">
              <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {(meta?.statuses || []).map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </Select>
              <Select label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['low', 'normal', 'high', 'urgent'].map((p) => (
                  <option key={p} value={p}>{humanize(p)}</option>
                ))}
              </Select>
              <Select label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {(meta?.categories || []).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Select label="Team" value={form.assignedTeam} onChange={(e) => setForm((f) => ({ ...f, assignedTeam: e.target.value }))}>
                <option value="">Unassigned</option>
                {(meta?.teams || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
              <Select label="Agent" value={form.assignedAgent} onChange={(e) => setForm((f) => ({ ...f, assignedAgent: e.target.value }))}>
                <option value="">Unassigned</option>
                {(meta?.agents || []).map((a) => (
                  <option key={a._id} value={a._id}>{a.name}</option>
                ))}
              </Select>
              <Textarea
                label="Resolution"
                value={form.resolution}
                onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                rows={3}
                placeholder="What fixed it?"
              />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-ink-900">Customer</h2>
            <Link to={`/admin/customers/${ticket.customerId?._id}`} className="text-sm text-brand-700 hover:text-brand-800">
              {ticket.customerId?.name || ticket.customerId?.email || 'Anonymous visitor'}
            </Link>
            <p className="mt-1 text-xs text-ink-500">{ticket.customerId?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

export default function Tickets() {
  const toast = useToast();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'open', productId: '', priority: '', search: '' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customerId: '', productId: '', title: '', description: '', category: 'Technical', priority: 'normal' });
  const [customers, setCustomers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ticketService.list({
        status: filters.status || undefined,
        productId: filters.productId || undefined,
        priority: filters.priority || undefined,
        search: filters.search || undefined,
      });
      setTickets(res.data || []);
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    ticketService.meta().then(setMeta).catch(() => null);
    productService.list().then(setProducts).catch(() => null);
    customerService.list({ limit: 100 }).then((r) => setCustomers(r.data || [])).catch(() => null);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.search]);

  async function create() {
    if (!form.title.trim() || !form.customerId || !form.productId) return;
    try {
      const t = await ticketService.create(form);
      toast.success(`Ticket ${t.ticketNumber} created`);
      setOpen(false);
      navigate(`/admin/tickets/${t._id}`);
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="For work that needs investigation beyond a live chat — not the default support path."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New ticket</Button>}
      >
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search tickets…"
              className="input pl-8"
              aria-label="Search tickets"
            />
          </div>
          <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="open">Open</option>
            <option value="">All statuses</option>
            {(meta?.statuses || []).map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </Select>
          <Select value={filters.productId} onChange={(e) => setFilters((f) => ({ ...f, productId: e.target.value }))} aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
          <Select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="Priority">
            <option value="">Any priority</option>
            {['urgent', 'high', 'normal', 'low'].map((p) => (
              <option key={p} value={p}>{humanize(p)}</option>
            ))}
          </Select>
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="No tickets"
            description="Tickets are created from a conversation when something needs deeper investigation."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Ticket</th>
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Priority</th>
                    <th className="px-4 py-2.5 font-semibold">Assigned</th>
                    <th className="px-4 py-2.5 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {tickets.map((t) => (
                    <tr
                      key={t._id}
                      onClick={() => navigate(`/admin/tickets/${t._id}`)}
                      className="cursor-pointer hover:bg-ink-50"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-[11px] text-ink-400">{t.ticketNumber}</p>
                        <p className="font-medium text-ink-900">{t.title}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{t.customerId?.name || t.customerId?.email || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{t.productId?.name}</td>
                      <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[t.status]}>{humanize(t.status)}</Badge></td>
                      <td className="px-4 py-2.5"><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{t.assignedAgent?.name || t.assignedTeam || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-400">{shortTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New ticket"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={!form.title.trim() || !form.customerId || !form.productId}>Create</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
              <option value="">Choose…</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>{c.name || c.email || 'Anonymous'}</option>
              ))}
            </Select>
            <Select label="Product" value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">Choose…</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
            <Select label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {(meta?.categories || ['Technical', 'Billing', 'Other']).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <Select label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
