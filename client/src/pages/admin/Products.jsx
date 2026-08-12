import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Package, ExternalLink, Copy, BookOpen, GraduationCap, MessageSquare, Check } from 'lucide-react';
import { productService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Modal, Badge, Spinner, EmptyState, Toggle } from '../../components/ui';

const slugify = (s = '') =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

const EMPTY = {
  name: '', slug: '', tagline: '', description: '', websiteUrl: '', loginUrl: '',
  supportEmail: '', brandColor: '#1E293B', aiWelcomeMessage: '', logo: '', active: true,
};

export default function Products() {
  const toast = useToast();
  const { can } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [copied, setCopied] = useState('');

  const load = () => productService.list().then(setProducts).finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  // Slug follows the name until the admin edits it by hand.
  const onName = (e) => {
    const name = e.target.value;
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await productService.create({ ...form, slug: form.slug || slugify(form.name) });
      toast.success(`${created.name} created — support page live at /support/${created.slug}`);
      setOpen(false);
      setForm(EMPTY);
      setSlugTouched(false);
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  const copyUrl = (slug) => {
    const url = `${window.location.origin}/support/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(''), 1500);
    toast.success('Support link copied');
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Every product gets its own support URL and its own isolated knowledge."
        actions={
          can('products') && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          )
        }
      />

      <div className="p-4 sm:p-6">
        {loading ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Create your first product to generate its support page."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New product</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <div key={p._id} className="card flex flex-col p-4">
                <div className="flex items-start gap-3">
                  {p.logo ? (
                    <img src={p.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ background: p.brandColor || '#1E293B' }}
                    >
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-900">{p.name}</p>
                      {!p.active && <Badge tone="gray">Inactive</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-500">{p.tagline || p.description || 'No description'}</p>
                  </div>
                </div>

                <button
                  onClick={() => copyUrl(p.slug)}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-ink-100"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-ink-700">/support/{p.slug}</span>
                  {copied === p.slug ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                  )}
                </button>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{p.counts.knowledge}</p>
                    <p className="flex items-center justify-center gap-1 text-[11px] text-ink-500">
                      <BookOpen className="h-3 w-3" /> KB
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{p.counts.videos}</p>
                    <p className="flex items-center justify-center gap-1 text-[11px] text-ink-500">
                      <GraduationCap className="h-3 w-3" /> Videos
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{p.counts.openConversations}</p>
                    <p className="flex items-center justify-center gap-1 text-[11px] text-ink-500">
                      <MessageSquare className="h-3 w-3" /> Open
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link to={`/admin/products/${p._id}`} className="btn-secondary flex-1 !text-xs">
                    Manage
                  </Link>
                  <a
                    href={`/support/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost !px-2"
                    aria-label="Open support page"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New product"
        description="This creates a dedicated support page with its own knowledge base."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!form.name.trim()}>Create product</Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Product name" name="name" value={form.name} onChange={onName} required placeholder="VideoClawBot" />
            <Input
              label="Support slug"
              name="slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
              }}
              placeholder="videoclawbot"
              hint={form.slug ? `Support page: /support/${form.slug}` : 'Generated from the name'}
            />
          </div>

          <Input label="Tagline" name="tagline" value={form.tagline} onChange={change} placeholder="AI video generation agents" />
          <Textarea label="Description" name="description" value={form.description} onChange={change} rows={2} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Website URL" name="websiteUrl" value={form.websiteUrl} onChange={change} placeholder="https://…" />
            <Input label="App login URL" name="loginUrl" value={form.loginUrl} onChange={change} placeholder="https://app…/login" />
            <Input label="Support email" name="supportEmail" value={form.supportEmail} onChange={change} placeholder="support@…" />
            <Input label="Logo URL" name="logo" value={form.logo} onChange={change} placeholder="https://…/logo.png" />
          </div>

          <div>
            <label className="label" htmlFor="brandColor">Brand colour</label>
            <div className="flex items-center gap-2">
              <input
                id="brandColor"
                type="color"
                name="brandColor"
                value={form.brandColor}
                onChange={change}
                className="h-9 w-14 cursor-pointer rounded border border-ink-300"
              />
              <input className="input" name="brandColor" value={form.brandColor} onChange={change} />
            </div>
          </div>

          <Textarea
            label="AI welcome message"
            name="aiWelcomeMessage"
            value={form.aiWelcomeMessage}
            onChange={change}
            rows={2}
            placeholder="Hi! I can help with…"
            hint="Shown at the top of the assistant conversation."
          />

          <Toggle
            checked={form.active}
            onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            label="Active"
            description="Inactive products return a 404 on their support URL."
          />
        </form>
      </Modal>
    </div>
  );
}
