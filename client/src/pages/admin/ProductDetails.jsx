import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Save, Trash2, Users, BookOpen, GraduationCap, MessageSquare, FlaskConical } from 'lucide-react';
import { productService, authService, knowledgeService } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Input, Textarea, Spinner, Badge, Modal, Toggle, StatCard, Alert } from '../../components/ui';

export default function ProductDetails() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(null);
  const [agents, setAgents] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Retrieval tester — the fastest way to debug a bad AI answer.
  const [testQuestion, setTestQuestion] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    const data = await productService.get(productId);
    setProduct(data);
    setForm({
      name: data.name, slug: data.slug, tagline: data.tagline || '', description: data.description || '',
      websiteUrl: data.websiteUrl || '', loginUrl: data.loginUrl || '', docsUrl: data.docsUrl || '',
      supportEmail: data.supportEmail || '', brandColor: data.brandColor || '#4f46e5',
      aiWelcomeMessage: data.aiWelcomeMessage || '', aiPersona: data.aiPersona || '', logo: data.logo || '',
      active: data.active,
    });
    setAssigned((data.agents || []).map((a) => a._id));
  };

  useEffect(() => {
    Promise.all([load(), authService.listAgents().then(setAgents).catch(() => null)])
      .catch((err) => toast.error(err.friendlyMessage))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (loading || !form) return <Spinner className="py-24" />;

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function save() {
    setSaving(true);
    try {
      await productService.update(productId, form);
      toast.success('Product updated');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  async function saveAgents(next) {
    setAssigned(next);
    try {
      await productService.setAgents(productId, next);
      toast.success('Team updated');
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  async function runTest(e) {
    e.preventDefault();
    if (!testQuestion.trim()) return;
    setTesting(true);
    try {
      setTestResult(await knowledgeService.testRetrieval({ productId, question: testQuestion }));
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    try {
      await productService.remove(productId, true);
      toast.success('Product deleted');
      navigate('/admin/products');
    } catch (err) {
      toast.error(err.friendlyMessage);
    }
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        description={`Support page: /support/${product.slug}`}
        actions={
          <>
            <a href={`/support/${product.slug}`} target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink className="h-4 w-4" /> View support page
            </a>
            {can('products') && (
              <Button onClick={save} loading={saving}>
                <Save className="h-4 w-4" /> Save changes
              </Button>
            )}
          </>
        }
      >
        <Link to="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> All products
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Knowledge items" value={product.counts.knowledge} icon={BookOpen} tone="indigo" />
          <StatCard label="Training videos" value={product.counts.videos} icon={GraduationCap} tone="blue" />
          <StatCard label="Open conversations" value={product.counts.openConversations} icon={MessageSquare} tone="amber" />
          <StatCard label="Online now" value={product.counts.onlineNow} icon={Users} tone="green" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/admin/knowledge?productId=${productId}`} className="btn-secondary">
            <BookOpen className="h-4 w-4" /> Manage knowledge
          </Link>
          <Link to={`/admin/training?productId=${productId}`} className="btn-secondary">
            <GraduationCap className="h-4 w-4" /> Manage training videos
          </Link>
          <Link to={`/admin/inbox?productId=${productId}`} className="btn-secondary">
            <MessageSquare className="h-4 w-4" /> Conversations
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">Product details</h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Name" name="name" value={form.name} onChange={change} />
                <Input label="Support slug" name="slug" value={form.slug} onChange={change} hint={`/support/${form.slug}`} />
              </div>
              <Input label="Tagline" name="tagline" value={form.tagline} onChange={change} />
              <Textarea label="Description" name="description" value={form.description} onChange={change} rows={2} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Website URL" name="websiteUrl" value={form.websiteUrl} onChange={change} />
                <Input label="App login URL" name="loginUrl" value={form.loginUrl} onChange={change} />
                <Input label="Docs URL" name="docsUrl" value={form.docsUrl} onChange={change} />
                <Input label="Support email" name="supportEmail" value={form.supportEmail} onChange={change} />
                <Input label="Logo URL" name="logo" value={form.logo} onChange={change} />
                <div>
                  <label className="label" htmlFor="pd-color">Brand colour</label>
                  <div className="flex gap-2">
                    <input
                      id="pd-color"
                      type="color"
                      name="brandColor"
                      value={form.brandColor}
                      onChange={change}
                      className="h-9 w-14 cursor-pointer rounded border border-ink-300"
                    />
                    <input className="input" name="brandColor" value={form.brandColor} onChange={change} />
                  </div>
                </div>
              </div>

              <Textarea
                label="AI welcome message"
                name="aiWelcomeMessage"
                value={form.aiWelcomeMessage}
                onChange={change}
                rows={2}
              />
              <Textarea
                label="AI tone guidance"
                name="aiPersona"
                value={form.aiPersona}
                onChange={change}
                rows={2}
                hint="Shapes how the assistant writes. It can never override the grounding rules."
              />

              <Toggle
                checked={form.active}
                onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                label="Active"
                description="Inactive products return 404 on their support URL."
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Team */}
            <div className="card p-5">
              <h2 className="mb-1 text-sm font-semibold text-ink-900">Assigned agents</h2>
              <p className="mb-3 text-xs text-ink-500">
                Agents see only the products they are assigned to. Managers and admins see everything.
              </p>
              <div className="space-y-1.5">
                {agents.map((a) => {
                  const on = assigned.includes(a._id);
                  return (
                    <label
                      key={a._id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 p-2 hover:bg-ink-50"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => saveAgents(on ? assigned.filter((id) => id !== a._id) : [...assigned, a._id])}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-800">{a.name}</span>
                        <span className="block truncate text-[11px] text-ink-500">{a.email}</span>
                      </span>
                      {a.isOnline && <Badge tone="green">Online</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Retrieval tester */}
            <div className="card p-5">
              <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <FlaskConical className="h-4 w-4 text-brand-600" /> Test retrieval
              </h2>
              <p className="mb-3 text-xs text-ink-500">
                See exactly which knowledge a customer question retrieves for this product.
              </p>
              <form onSubmit={runTest} className="flex gap-2">
                <input
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                  placeholder="How do I create a custom agent?"
                  className="input !text-xs"
                />
                <Button size="sm" type="submit" loading={testing}>Run</Button>
              </form>

              {testResult && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-ink-500">
                    Strategy: <span className="font-mono">{testResult.strategy}</span>
                    {testResult.embedded ? ' · semantic' : ' · keyword only'}
                  </p>
                  {testResult.chunks.length === 0 ? (
                    <Alert tone="warning">
                      Nothing matched. The assistant will refuse this question and offer a human instead.
                    </Alert>
                  ) : (
                    testResult.chunks.map((c) => (
                      <div key={c._id} className="rounded-lg border border-ink-200 p-2">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">{c.title}</p>
                          <Badge tone="blue">{c.score.toFixed(2)}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-ink-500">{c.preview}</p>
                      </div>
                    ))
                  )}
                  {testResult.videos.length > 0 && (
                    <p className="text-[11px] text-ink-600">
                      Video match: <strong>{testResult.videos[0].title}</strong> ({testResult.videos[0].score.toFixed(2)})
                    </p>
                  )}
                </div>
              )}
            </div>

            {can('products') && (
              <div className="card border-red-200 p-5">
                <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
                <p className="mt-1 text-xs text-ink-500">
                  Deleting removes the product, its knowledge base and its training videos. Conversations are kept.
                </p>
                <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete product
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${product.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete permanently</Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          The support page at <code>/support/{product.slug}</code> will stop working, and{' '}
          {product.counts.knowledge} knowledge item(s) and {product.counts.videos} video(s) will be deleted. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
