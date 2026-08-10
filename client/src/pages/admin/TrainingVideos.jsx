import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, GraduationCap, Pencil, Trash2, Power, PlayCircle, MousePointerClick } from 'lucide-react';
import { trainingService, productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Select, Modal, Badge, Spinner, EmptyState, Toggle } from '../../components/ui';
import { videoDuration } from '../../utils/format';

const EMPTY = {
  productId: '', title: '', description: '', feature: '', category: 'Tutorial',
  keywords: '', questionVariations: '', videoUrl: '', thumbnailUrl: '', duration: 0, sortOrder: 0, active: true,
};

export default function TrainingVideos() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const productId = params.get('productId') || '';

  const [videos, setVideos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVideos(await trainingService.list({ productId: productId || undefined }));
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, productId: productId || products[0]?._id || '' });
    setOpen(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      productId: v.productId?._id || v.productId,
      title: v.title,
      description: v.description || '',
      feature: v.feature || '',
      category: v.category || 'Tutorial',
      keywords: (v.keywords || []).join(', '),
      questionVariations: (v.questionVariations || []).join('\n'),
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl || '',
      duration: v.duration || 0,
      sortOrder: v.sortOrder || 0,
      active: v.active,
    });
    setOpen(true);
  };

  async function submit(e) {
    e?.preventDefault();
    if (!form.productId) return toast.error('Choose a product');
    setSaving(true);
    try {
      if (editing) {
        await trainingService.update(editing._id, form);
        toast.success('Video updated');
      } else {
        await trainingService.create(form);
        toast.success('Video added');
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

  async function remove(v) {
    if (!window.confirm(`Delete "${v.title}"?`)) return;
    try {
      await trainingService.remove(v._id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div>
      <PageHeader
        title="Training videos"
        description="The assistant recommends at most one video per answer, and only when it genuinely matches."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> Add video</Button>}
      >
        <Select
          value={productId}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('productId', e.target.value);
            else next.delete('productId');
            setParams(next, { replace: true });
          }}
          className="max-w-xs"
          aria-label="Filter by product"
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </Select>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : videos.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No training videos"
            description="Add walkthroughs so the assistant can point customers at a video instead of a wall of text."
            action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Add video</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((v) => (
              <div key={v._id} className={`card overflow-hidden ${!v.active ? 'opacity-60' : ''}`}>
                <div className="relative aspect-video bg-ink-100">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <PlayCircle className="h-8 w-8 text-ink-300" />
                    </div>
                  )}
                  {v.duration > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-ink-900/80 px-1.5 py-0.5 text-[11px] text-white">
                      {videoDuration(v.duration)}
                    </span>
                  )}
                </div>

                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{v.title}</p>
                      <p className="truncate text-xs text-ink-500">{v.productId?.name}</p>
                    </div>
                    {!v.active && <Badge tone="gray">Off</Badge>}
                  </div>

                  {v.feature && <Badge tone="indigo" className="mt-2">{v.feature}</Badge>}

                  <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3 w-3" /> {v.recommendedCount || 0} shown
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" /> {v.clickCount || 0} clicks
                    </span>
                  </div>

                  <div className="mt-3 flex gap-1">
                    <a href={v.videoUrl} target="_blank" rel="noreferrer" className="btn-secondary flex-1 !py-1 !text-xs">
                      Preview
                    </a>
                    <button
                      onClick={() => trainingService.toggle(v._id).then(load)}
                      className="rounded p-1.5 text-ink-400 hover:bg-ink-100"
                      title={v.active ? 'Disable' : 'Enable'}
                    >
                      <Power className={`h-4 w-4 ${v.active ? 'text-emerald-600' : ''}`} />
                    </button>
                    <button onClick={() => openEdit(v)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(v)} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit training video' : 'Add training video'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.title.trim() || !form.videoUrl.trim()}>
              {editing ? 'Save changes' : 'Add video'}
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
            <Input
              label="Feature"
              value={form.feature}
              onChange={(e) => setForm((f) => ({ ...f, feature: e.target.value }))}
              placeholder="Custom Agent"
              hint="The capability this video teaches."
            />
          </div>

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="How to Create a Custom Agent"
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Video URL" value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder="https://…" />
            <Input label="Thumbnail URL" value={form.thumbnailUrl} onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="https://…" />
            <Input label="Duration (seconds)" type="number" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} />
            <Input label="Sort order" type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </div>

          <Input
            label="Keywords"
            value={form.keywords}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            placeholder="custom agent, create agent, agent setup"
            hint="Comma separated."
          />

          <Textarea
            label="Question variations"
            value={form.questionVariations}
            onChange={(e) => setForm((f) => ({ ...f, questionVariations: e.target.value }))}
            rows={4}
            placeholder={'How do I create a custom agent?\nHow to create a custom agent\nWhere do I make a new agent?'}
            hint="One per line. These are the strongest matching signal — write the phrasings customers actually use."
          />

          <Toggle checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} label="Active" />
        </form>
      </Modal>
    </div>
  );
}
