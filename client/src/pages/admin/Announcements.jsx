import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Bell, Pencil, Trash2, Power } from 'lucide-react';
import { announcementService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Select, Modal, Badge, Spinner, EmptyState, Toggle } from '../../components/ui';
import { fullTime } from '../../utils/format';

const TYPES = ['Maintenance', 'New Feature', 'Product Update', 'Training Update', 'Service Notice', 'General Announcement'];
const TONE = {
  Maintenance: 'amber',
  'Service Notice': 'amber',
  'New Feature': 'indigo',
  'Product Update': 'blue',
  'Training Update': 'purple',
  'General Announcement': 'gray',
};

const EMPTY = {
  title: '', content: '', type: 'General Announcement', productId: '', priority: 'normal',
  startAt: '', endAt: '', linkUrl: '', linkText: '', active: true,
};

export default function Announcements() {
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('marketing') || can('announcements');

  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [productFilter, setProductFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await announcementService.list({ productId: productFilter || undefined });
      setItems(res.data || []);
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [productFilter, toast]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content || '',
      type: a.type,
      productId: a.productId?._id || a.productId || '',
      priority: a.priority,
      startAt: a.startAt ? a.startAt.slice(0, 10) : '',
      endAt: a.endAt ? a.endAt.slice(0, 10) : '',
      linkUrl: a.linkUrl || '',
      linkText: a.linkText || '',
      active: a.active,
    });
    setOpen(true);
  };

  async function submit() {
    setSaving(true);
    try {
      const payload = { ...form, productId: form.productId || null, endAt: form.endAt || null };
      if (editing) await announcementService.update(editing._id, payload);
      else await announcementService.create(payload);
      toast.success(editing ? 'Announcement updated' : 'Announcement published');
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try {
      await announcementService.remove(a._id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Shown on the relevant product's support page. High-priority notices appear above everything else."
        actions={canEdit && <Button onClick={openNew}><Plus className="h-4 w-4" /> New announcement</Button>}
      >
        <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="max-w-xs" aria-label="Filter by product">
          <option value="">All products</option>
          <option value="global">Global (all products)</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </Select>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No announcements"
            description="Post maintenance windows, new features and service notices so customers see them before they ask."
            action={canEdit && <Button onClick={openNew}><Plus className="h-4 w-4" /> New announcement</Button>}
          />
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a._id} className={`card p-4 ${!a.active ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{a.title}</p>
                      <Badge tone={TONE[a.type] || 'gray'}>{a.type}</Badge>
                      {a.priority !== 'normal' && (
                        <Badge tone={a.priority === 'urgent' ? 'red' : 'amber'}>{a.priority}</Badge>
                      )}
                      <Badge tone="gray">{a.productId?.name || 'All products'}</Badge>
                      {!a.active && <Badge tone="gray">Inactive</Badge>}
                    </div>
                    {a.content && <p className="mt-1.5 text-sm text-ink-600">{a.content}</p>}
                    <p className="mt-2 text-xs text-ink-400">
                      Live from {fullTime(a.startAt)}
                      {a.endAt ? ` until ${fullTime(a.endAt)}` : ' with no end date'}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => announcementService.update(a._id, { active: !a.active }).then(load)}
                        className="rounded p-1.5 text-ink-400 hover:bg-ink-100"
                        title={a.active ? 'Disable' : 'Enable'}
                      >
                        <Power className={`h-4 w-4 ${a.active ? 'text-emerald-600' : ''}`} />
                      </button>
                      <button onClick={() => openEdit(a)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(a)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit announcement' : 'New announcement'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.title.trim()}>
              {editing ? 'Save changes' : 'Publish'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Content" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <Select label="Product" value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
            <Select label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {['low', 'normal', 'high', 'urgent'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <div />
            <Input label="Start date" type="date" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
            <Input label="End date (optional)" type="date" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
            <Input label="Link URL (optional)" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} />
            <Input label="Link text" value={form.linkText} onChange={(e) => setForm((f) => ({ ...f, linkText: e.target.value }))} placeholder="Read more" />
          </div>

          <Toggle checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} label="Active" />
        </div>
      </Modal>
    </div>
  );
}
