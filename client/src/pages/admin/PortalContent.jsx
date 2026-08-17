import React, { useEffect, useState } from 'react';
import { Plus, Trash2, LayoutGrid, Bell } from 'lucide-react';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Badge, Spinner, Modal, Input, Textarea, Select, Toggle } from '../../components/ui';
import { portalContentService, productService, toMessage } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';

const PLACEMENTS = [
  ['customer_dashboard_featured', 'Dashboard — Featured'],
  ['customer_dashboard_recommended', 'Dashboard — Recommended'],
  ['customer_dashboard_whats_new', 'Dashboard — What’s New'],
  ['product_page_related', 'Product page — Related'],
];
const BADGES = ['New', 'Featured', 'Recommended', 'Upgrade', 'Add-on'];

const emptyCard = {
  name: '', title: '', description: '', promotedProductId: '', placement: 'customer_dashboard_recommended',
  badge: 'Recommended', ctaText: 'Learn more', internalDestination: '', excludeExistingOwners: true, displayOrder: 0, active: true,
};

function CardModal({ open, onClose, onSaved, products, initial }) {
  const [form, setForm] = useState(initial || emptyCard);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setForm(initial || emptyCard);
  }, [initial, open]);

  const save = async () => {
    if (!form.title || !form.promotedProductId) return toast.error('Title and promoted product are required');
    setBusy(true);
    try {
      const payload = { ...form, name: form.name || form.title };
      if (initial?._id) await portalContentService.updateCard(initial._id, payload);
      else await portalContentService.createCard(payload);
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?._id ? 'Edit card' : 'New dashboard card'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}
    >
      <div className="space-y-3">
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Promoted product" value={form.promotedProductId} onChange={(e) => setForm({ ...form, promotedProductId: e.target.value })}>
            <option value="">Select…</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
          <Select label="Placement" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}>
            {PLACEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select label="Badge" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })}>
            {BADGES.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Input label="CTA text" value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} />
          <Input label="Internal link (optional)" placeholder="/portal/products/slug" value={form.internalDestination} onChange={(e) => setForm({ ...form, internalDestination: e.target.value })} />
          <Input label="Display order" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} />
        </div>
        <Toggle
          checked={form.excludeExistingOwners}
          onChange={(v) => setForm({ ...form, excludeExistingOwners: v })}
          label="Hide from existing owners"
          description="Turn off for upgrade / add-on offers aimed at current owners."
        />
        <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
      </div>
    </Modal>
  );
}

export default function PortalContent() {
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const [overview, prods] = await Promise.all([portalContentService.overview(), productService.list()]);
      setData(overview);
      setProducts(prods || []);
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    if (!window.confirm('Delete this card?')) return;
    try {
      await portalContentService.deleteCard(id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  if (!data) return <div className="p-8"><Spinner label="Loading portal content…" /></div>;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Portal Content"
        description="Control the cards, recommendations and announcements customers see in their portal."
        actions={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="h-4 w-4" /> New card</Button>}
      />

      <div className="flex-1 space-y-8 overflow-y-auto p-4 sm:p-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <LayoutGrid className="h-4 w-4" /> Dashboard cards & recommendations
          </h2>
          {data.cards.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.cards.map((c) => (
                <div key={c._id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <Badge tone="indigo">{c.badge}</Badge>
                    <div className="flex items-center gap-1">
                      {!c.active && <Badge tone="gray">inactive</Badge>}
                      <button onClick={() => { setEditing(c); setModalOpen(true); }} className="text-xs text-brand-700 hover:underline">Edit</button>
                      <button onClick={() => remove(c._id)} className="text-ink-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="mt-2 font-medium text-ink-900">{c.title}</p>
                  <p className="line-clamp-2 text-sm text-ink-500">{c.description}</p>
                  <p className="mt-2 text-xs text-ink-400">{c.placement.replace(/_/g, ' ')} · {c.impressions} views · {c.clicks} clicks</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
              No portal cards yet. Create one to feature a product on the dashboard.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <Bell className="h-4 w-4" /> Portal announcements
          </h2>
          {data.announcements.length ? (
            <div className="space-y-2">
              {data.announcements.map((a) => (
                <div key={a._id} className="flex items-center justify-between rounded-lg border border-ink-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{a.title}</p>
                    <p className="text-xs text-ink-500">{a.type}{a.productId ? ` · ${a.productId.name}` : ' · Global'}</p>
                  </div>
                  {a.active ? <Badge tone="green">live</Badge> : <Badge tone="gray">off</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
              No portal announcements. Toggle “Show in portal” on an announcement in the Announcements screen to surface it here.
            </p>
          )}
        </section>
      </div>

      <CardModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} products={products} initial={editing} />
    </div>
  );
}
