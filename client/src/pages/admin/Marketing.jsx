import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Megaphone, Pencil, Trash2, Power, MousePointerClick, Eye } from 'lucide-react';
import { recommendationService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Select, Modal, Badge, Spinner, EmptyState, Toggle, Alert } from '../../components/ui';
import { humanize } from '../../utils/format';

const PLACEMENTS = ['support_homepage', 'whats_new', 'training_page', 'after_resolution', 'knowledge_footer'];

const EMPTY = {
  name: '', promotedProductId: '', title: '', description: '', imageUrl: '',
  ctaText: 'Learn more', ctaUrl: '', sourceProducts: [], placement: 'support_homepage',
  triggerKeywords: '', frequencyLimit: 1, active: true,
};

export default function Marketing() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await recommendationService.list();
      setItems(res.data || []);
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      name: r.name,
      promotedProductId: r.promotedProductId?._id || r.promotedProductId,
      title: r.title,
      description: r.description || '',
      imageUrl: r.imageUrl || '',
      ctaText: r.ctaText || 'Learn more',
      ctaUrl: r.ctaUrl || '',
      sourceProducts: (r.sourceProducts || []).map((p) => p._id || p),
      placement: r.placement,
      triggerKeywords: (r.triggerKeywords || []).join(', '),
      frequencyLimit: r.frequencyLimit || 1,
      active: r.active,
    });
    setOpen(true);
  };

  async function submit() {
    if (!form.name.trim() || !form.promotedProductId || !form.title.trim()) return;
    setSaving(true);
    try {
      if (editing) await recommendationService.update(editing._id, form);
      else await recommendationService.create(form);
      toast.success(editing ? 'Recommendation updated' : 'Recommendation created');
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Delete "${r.name}"?`)) return;
    try {
      await recommendationService.remove(r._id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  const toggleSource = (id) =>
    setForm((f) => ({
      ...f,
      sourceProducts: f.sourceProducts.includes(id)
        ? f.sourceProducts.filter((x) => x !== id)
        : [...f.sourceProducts, id],
    }));

  return (
    <div>
      <PageHeader
        title="Product recommendations"
        description="Subtle cross-product discovery on support surfaces."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> New recommendation</Button>}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <Alert tone="info" title="Support always comes first">
          Recommendations are suppressed automatically during refunds, payment failures, account lockouts, serious bugs
          and any conversation where the customer sounds frustrated. That rule is enforced on the server — it is not a
          UI setting.
        </Alert>

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No recommendations"
            description="Create one to introduce customers of one product to another, without interrupting support."
            action={<Button onClick={openNew}><Plus className="h-4 w-4" /> New recommendation</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((r) => (
              <div key={r._id} className={`card p-4 ${!r.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{r.name}</p>
                      {!r.active && <Badge tone="gray">Inactive</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      Promotes <strong>{r.promotedProductId?.name}</strong> · {humanize(r.placement)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => recommendationService.update(r._id, { active: !r.active }).then(load)}
                      className="rounded p-1.5 text-ink-400 hover:bg-ink-100"
                      title={r.active ? 'Disable' : 'Enable'}
                    >
                      <Power className={`h-4 w-4 ${r.active ? 'text-emerald-600' : ''}`} />
                    </button>
                    <button onClick={() => openEdit(r)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(r)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-dashed border-ink-300 p-3">
                  <p className="text-sm font-medium text-ink-900">{r.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{r.description}</p>
                  <p className="mt-1.5 text-xs font-medium text-brand-600">{r.ctaText} →</p>
                </div>

                {r.triggerKeywords?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[11px] text-ink-400">Triggers on:</span>
                    {r.triggerKeywords.map((k) => (
                      <Badge key={k} tone="gray">{k}</Badge>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {r.impressions} shown</span>
                  <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {r.clicks} clicks</span>
                  <span className="ml-auto font-medium text-ink-700">{r.ctr}% CTR</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit recommendation' : 'New recommendation'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.name.trim() || !form.promotedProductId || !form.title.trim()}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Internal name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Thumb Generator for video creators" />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Promoted product"
              value={form.promotedProductId}
              onChange={(e) => setForm((f) => ({ ...f, promotedProductId: e.target.value }))}
            >
              <option value="">Choose…</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
            <Select label="Placement" value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>{humanize(p)}</option>
              ))}
            </Select>
          </div>

          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Need thumbnails to match?" />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="CTA text" value={form.ctaText} onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))} />
            <Input label="CTA URL" value={form.ctaUrl} onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))} placeholder="/support/thumb-generator" />
            <Input label="Image URL" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} />
            <Input
              label="Frequency limit"
              type="number"
              value={form.frequencyLimit}
              onChange={(e) => setForm((f) => ({ ...f, frequencyLimit: e.target.value }))}
              hint="Max impressions per customer."
            />
          </div>

          <Input
            label="Trigger keywords"
            value={form.triggerKeywords}
            onChange={(e) => setForm((f) => ({ ...f, triggerKeywords: e.target.value }))}
            placeholder="thumbnail, thumbnails, ctr"
            hint="Comma separated. Only shown in chat when the customer's question contains one of these — and only after their question has been answered."
          />

          <div>
            <p className="label">Show on these products&apos; support pages</p>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => toggleSource(p._id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.sourceProducts.includes(p._id)
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-ink-200 bg-white text-ink-600'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-500">Select none to show on every product.</p>
          </div>

          <Toggle checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} label="Active" />
        </div>
      </Modal>
    </div>
  );
}
