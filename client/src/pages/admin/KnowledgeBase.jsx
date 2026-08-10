import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, BookOpen, Pencil, Trash2, RefreshCw, Power } from 'lucide-react';
import { knowledgeService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Select, Modal, Badge, Spinner, EmptyState, Toggle } from '../../components/ui';
import { shortTime } from '../../utils/format';

const EMPTY = { productId: '', category: 'Getting Started', title: '', content: '', summary: '', keywords: '', tags: '', active: true };

export default function KnowledgeBase() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const productId = params.get('productId') || '';
  const category = params.get('category') || '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await knowledgeService.list({
        productId: productId || undefined,
        category: category || undefined,
        search: search || undefined,
        limit: 200,
      });
      setItems(res.data || []);
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [productId, category, search, toast]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
    knowledgeService.categories().then(setCategories).catch(() => null);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, productId: productId || products[0]?._id || '' });
    setOpen(true);
  };

  const openEdit = async (item) => {
    try {
      const full = await knowledgeService.get(item._id);
      setEditing(full);
      setForm({
        productId: full.productId?._id || full.productId,
        category: full.category,
        title: full.title,
        content: full.content,
        summary: full.summary || '',
        keywords: (full.keywords || []).join(', '),
        tags: (full.tags || []).join(', '),
        active: full.active,
      });
      setOpen(true);
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  };

  async function submit(e) {
    e?.preventDefault();
    if (!form.productId) return toast.error('Choose a product — knowledge cannot be global');
    setSaving(true);
    try {
      if (editing) {
        await knowledgeService.update(editing._id, form);
        toast.success('Knowledge updated and re-indexed');
      } else {
        const created = await knowledgeService.create(form);
        toast.success(`Added and indexed into ${created.chunks} retrievable chunk(s)`);
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
    return undefined;
  }

  async function toggle(item) {
    try {
      await knowledgeService.toggle(item._id);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"? This removes it from AI retrieval immediately.`)) return;
    try {
      await knowledgeService.remove(item._id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  async function reindex() {
    setReindexing(true);
    try {
      const res = await knowledgeService.reindex(productId || undefined);
      toast.success(`Reindexed ${res.items} items into ${res.chunks} chunks`);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="The only source the AI is allowed to answer from. Knowledge never crosses products."
        actions={
          <>
            <Button variant="secondary" onClick={reindex} loading={reindexing}>
              <RefreshCw className="h-4 w-4" /> Reindex
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add knowledge
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search knowledge…"
              className="input pl-8"
              aria-label="Search knowledge"
            />
          </div>
          <Select value={productId} onChange={(e) => setParam('productId', e.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No knowledge yet"
            description="Add product documentation, FAQs and troubleshooting steps. Without knowledge, the assistant will always escalate."
            action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Add knowledge</Button>}
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Title</th>
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 font-semibold">Category</th>
                    <th className="px-4 py-2.5 font-semibold">Chunks</th>
                    <th className="px-4 py-2.5 font-semibold">Used</th>
                    <th className="px-4 py-2.5 font-semibold">Updated</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {items.map((item) => (
                    <tr key={item._id} className={!item.active ? 'opacity-50' : undefined}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink-900">{item.title}</p>
                        {item.keywords?.length > 0 && (
                          <p className="mt-0.5 truncate text-xs text-ink-400">{item.keywords.slice(0, 5).join(' · ')}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{item.productId?.name}</td>
                      <td className="px-4 py-2.5"><Badge tone="indigo">{item.category}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">
                        {item.chunkCount || 0}
                        {item.embeddingStatus === 'ready' && <Badge tone="green" className="ml-1">vector</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink-600">{item.usageCount || 0}</td>
                      <td className="px-4 py-2.5 text-xs text-ink-400">{shortTime(item.updatedAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => toggle(item)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title={item.active ? 'Disable' : 'Enable'}>
                            <Power className={`h-4 w-4 ${item.active ? 'text-emerald-600' : ''}`} />
                          </button>
                          <button onClick={() => openEdit(item)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => remove(item)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
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
        title={editing ? 'Edit knowledge' : 'Add knowledge'}
        description="Write it the way you would explain it to a customer. The AI quotes this, it does not embellish it."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.title.trim() || !form.content.trim()}>
              {editing ? 'Save changes' : 'Add knowledge'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Product"
              value={form.productId}
              onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
              disabled={Boolean(editing)}
            >
              <option value="">Choose a product…</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
            <Select label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="How to create a custom agent"
          />

          <Textarea
            label="Content"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={14}
            placeholder={'Explain the feature, then give numbered steps.\n\n1. Open the dashboard.\n2. Click New Agent.\n…'}
            hint="Numbered lines become step-by-step instructions in the customer's answer."
          />

          <Input
            label="Summary (optional)"
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            placeholder="One line shown in the help centre listing"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Keywords"
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="custom agent, create agent, agent setup"
              hint="Comma separated. These strongly boost retrieval."
            />
            <Input
              label="Tags"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="agents, getting-started"
            />
          </div>

          <Toggle
            checked={form.active}
            onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            label="Active"
            description="Disabled items are excluded from AI retrieval and the help centre."
          />
        </form>
      </Modal>
    </div>
  );
}
