import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Save, Trash2, Users, BookOpen, GraduationCap, MessageSquare, FlaskConical, Plus } from 'lucide-react';
import { productService, authService, knowledgeService, integrationService } from '../../services/endpoints';
import { productHost } from '../../utils/productLogo';
import { SUPPORT_THEME_DEFAULTS, resolveSupportTheme } from '../../utils/supportTheme';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/admin/PageHeader';
import FormSection, { CardHeader } from '../../components/admin/FormSection';
import SupportPageEditor from '../../components/admin/SupportPageEditor';
import { Button, Input, Textarea, Spinner, Badge, Modal, Toggle, StatCard, Alert, ProductLogo } from '../../components/ui';

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
  const [ipnUrl, setIpnUrl] = useState('');

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
      supportEmail: data.supportEmail || '', brandColor: data.brandColor || '#1E293B',
      aiWelcomeMessage: data.aiWelcomeMessage || '', aiPersona: data.aiPersona || '', logo: data.logo || '',
      active: data.active,
      // Resolved rather than raw: the editor always has a concrete value to
      // show, and saving writes back exactly what the page will use.
      supportPage: resolveSupportTheme(data),
      // Membership-portal fields.
      purchaseUrl: data.purchaseUrl || '', launchUrl: data.launchUrl || '',
      accessMode: data.accessMode || 'external_url',
      cardImage: data.cardImage || '', cardDescription: data.cardDescription || '',
      featured: Boolean(data.featured),
      dashboardVisibility: data.dashboardVisibility || 'owners',
      sortOrder: data.sortOrder || 0,
      // Structured JVZoo mappings. Legacy flat ids (if any) are surfaced as
      // read-only fe mappings so nothing is silently dropped on save.
      jvzooMappings:
        (data.jvzooMappings && data.jvzooMappings.length
          ? data.jvzooMappings
          : (data.jvzooProductIds || []).map((id) => ({ externalProductId: id, offerType: 'fe', accessPlan: '', active: true }))
        ).map((m) => ({
          externalProductId: m.externalProductId || '',
          offerType: m.offerType || 'fe',
          accessPlan: m.accessPlan || '',
          active: m.active !== false,
        })),
      portalPage: {
        heroTitle: data.portalPage?.heroTitle || '',
        heroSubtitle: data.portalPage?.heroSubtitle || '',
        heroImage: data.portalPage?.heroImage || '',
        heroVideoUrl: data.portalPage?.heroVideoUrl || '',
        overviewContent: data.portalPage?.overviewContent || '',
        gettingStartedContent: data.portalPage?.gettingStartedContent || '',
        howItWorksContent: data.portalPage?.howItWorksContent || '',
        pageStatus: data.portalPage?.pageStatus || 'published',
      },
    });
    setAssigned((data.agents || []).map((a) => a._id));
  };

  useEffect(() => {
    Promise.all([load(), authService.listAgents().then(setAgents).catch(() => null)])
      .catch((err) => toast.error(err.friendlyMessage))
      .finally(() => setLoading(false));
    // The IPN URL comes from the backend (its own host), only for integrations admins.
    if (can('integrations')) {
      integrationService.status().then((s) => setIpnUrl(s?.jvzoo?.ipnUrl || '')).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (loading || !form) return <Spinner className="py-24" />;

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const changeSupport = (key, value) =>
    setForm((f) => ({ ...f, supportPage: { ...f.supportPage, [key]: value } }));

  const resetSupportPage = () => setForm((f) => ({ ...f, supportPage: { ...SUPPORT_THEME_DEFAULTS } }));

  async function save() {
    setSaving(true);
    try {
      // Editing JVZoo mappings is an integrations action, so it is only ever
      // included when this user holds that capability — sending it otherwise
      // would be rejected server-side and block the whole save.
      const payload = { ...form };
      delete payload.jvzooMappings;
      if (can('integrations')) {
        payload.jvzooMappings = (form.jvzooMappings || [])
          .map((m) => ({
            externalProductId: String(m.externalProductId || '').trim(),
            offerType: m.offerType || 'fe',
            accessPlan: String(m.accessPlan || '').trim(),
            active: m.active !== false,
          }))
          .filter((m) => m.externalProductId);
      }
      await productService.update(productId, payload);
      toast.success('Product updated');
      load();
    } catch (err) {
      toast.error(err.friendlyMessage);
    } finally {
      setSaving(false);
    }
  }

  const changePortal = (key, value) =>
    setForm((f) => ({ ...f, portalPage: { ...f.portalPage, [key]: value } }));

  /* JVZoo mapping row helpers. */
  const addMapping = () =>
    setForm((f) => ({
      ...f,
      jvzooMappings: [...(f.jvzooMappings || []), { externalProductId: '', offerType: 'fe', accessPlan: '', active: true }],
    }));
  const changeMapping = (idx, key, value) =>
    setForm((f) => ({
      ...f,
      jvzooMappings: f.jvzooMappings.map((m, i) => (i === idx ? { ...m, [key]: value } : m)),
    }));
  const removeMapping = (idx) =>
    setForm((f) => ({ ...f, jvzooMappings: f.jvzooMappings.filter((_, i) => i !== idx) }));

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

        {/* What the customer actually meets, so it sits above the plumbing. */}
        <SupportPageEditor
          product={{ ...product, ...form }}
          theme={form.supportPage}
          slug={form.slug}
          onChange={changeSupport}
          onReset={resetSupportPage}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-5 sm:p-6 lg:col-span-2">
            <CardHeader title="Product details" description="The record behind the support page." />

            <div className="space-y-6">
              <FormSection title="Basics">
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Name" name="name" value={form.name} onChange={change} />
                    <Input label="Support slug" name="slug" value={form.slug} onChange={change} hint={`/support/${form.slug}`} />
                  </div>
                  <Input label="Tagline" name="tagline" value={form.tagline} onChange={change} />
                  <Textarea label="Description" name="description" value={form.description} onChange={change} rows={2} />
                </div>
              </FormSection>

              <FormSection title="Links">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Website URL" name="websiteUrl" value={form.websiteUrl} onChange={change} />
                  <Input label="App login URL" name="loginUrl" value={form.loginUrl} onChange={change} />
                  <Input label="Docs URL" name="docsUrl" value={form.docsUrl} onChange={change} />
                  <Input label="Support email" name="supportEmail" value={form.supportEmail} onChange={change} />
                </div>
              </FormSection>

              <FormSection title="Branding">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Logo URL"
                    name="logo"
                    value={form.logo}
                    onChange={change}
                    hint="Optional — leave empty to use the website's own icon."
                  />
                  <div>
                    <span className="label">Logo preview</span>
                    <div className="flex items-center gap-2.5">
                      <ProductLogo product={form} className="h-10 w-10" />
                      <p className="text-xs text-ink-500">
                        {form.logo
                          ? 'Using the logo URL above.'
                          : productHost(form.websiteUrl)
                            ? `From ${productHost(form.websiteUrl)}`
                            : 'Add a website URL and the icon appears here.'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="pd-color">Brand colour</label>
                    <div className="flex gap-2">
                      <input
                        id="pd-color"
                        type="color"
                        name="brandColor"
                        value={form.brandColor}
                        onChange={change}
                        className="h-9 w-11 shrink-0 cursor-pointer rounded border border-ink-300"
                      />
                      <input className="input min-w-0" name="brandColor" value={form.brandColor} onChange={change} />
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Assistant" description="Used by the AI on this product's support page.">
                <div className="space-y-4">
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
                </div>
              </FormSection>

              {can('integrations') && (
                <FormSection title="JVZoo Mapping" description="Map JVZoo offers (FE, OTO, bundle, add-on) to this product. A verified purchase of any active mapping grants access with its plan.">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
                      <p className="mb-1 text-xs font-medium text-ink-600">Central IPN URL (paste into every JVZoo product’s IPN settings)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-ink-800">{ipnUrl || '—'}</code>
                        <Button type="button" variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(ipnUrl); toast.success('Copied'); }}>Copy</Button>
                      </div>
                    </div>

                    {(form.jvzooMappings || []).length === 0 && (
                      <p className="text-sm text-ink-500">No mappings yet. Add the JVZoo product ID for each offer.</p>
                    )}

                    {(form.jvzooMappings || []).map((m, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-ink-200 p-3 sm:grid-cols-[1fr_auto_1fr_auto_auto] sm:items-end">
                        <Input label={idx === 0 ? 'JVZoo product ID' : ''} value={m.externalProductId} onChange={(e) => changeMapping(idx, 'externalProductId', e.target.value)} placeholder="e.g. 385761" />
                        <div>
                          {idx === 0 && <span className="label">Offer</span>}
                          <select className="input" value={m.offerType} onChange={(e) => changeMapping(idx, 'offerType', e.target.value)}>
                            <option value="fe">FE</option>
                            <option value="oto">OTO</option>
                            <option value="bundle">Bundle</option>
                            <option value="addon">Add-on</option>
                          </select>
                        </div>
                        <Input label={idx === 0 ? 'Access plan' : ''} value={m.accessPlan} onChange={(e) => changeMapping(idx, 'accessPlan', e.target.value)} placeholder="e.g. pro" />
                        <label className="inline-flex items-center gap-1.5 pb-2 text-sm text-ink-600">
                          <input type="checkbox" checked={m.active} onChange={(e) => changeMapping(idx, 'active', e.target.checked)} /> Active
                        </label>
                        <button type="button" onClick={() => removeMapping(idx)} className="pb-2 text-ink-400 hover:text-red-600" title="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <Button type="button" variant="secondary" size="sm" onClick={addMapping}>
                      <Plus className="h-4 w-4" /> Add JVZoo mapping
                    </Button>
                  </div>
                </FormSection>
              )}

              <FormSection title="Launch & access" description="How owners open the product from the portal.">
                <div className="space-y-3">
                  <Input label="Launch URL (Open App)" name="launchUrl" value={form.launchUrl} onChange={change} hint="Never trusted from the browser — the server checks entitlement before returning it." />
                  <Input label="Purchase URL" name="purchaseUrl" value={form.purchaseUrl} onChange={change} hint="Where non-owners are sent to buy." />
                  <div>
                    <span className="label">Access mode</span>
                    <select className="input" name="accessMode" value={form.accessMode} onChange={change}>
                      <option value="external_url">External URL</option>
                      <option value="signed_url">Signed URL (append launch token)</option>
                      <option value="none">No app (info page only)</option>
                    </select>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Dashboard card" description="How this product appears on the customer dashboard.">
                <div className="space-y-3">
                  <Input label="Card image URL" name="cardImage" value={form.cardImage} onChange={change} />
                  <Textarea label="Card description" name="cardDescription" value={form.cardDescription} onChange={change} rows={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="label">Dashboard visibility</span>
                      <select className="input" name="dashboardVisibility" value={form.dashboardVisibility} onChange={change}>
                        <option value="owners">Owners only</option>
                        <option value="everyone">Everyone (discovery)</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                    <Input label="Sort order" type="number" name="sortOrder" value={form.sortOrder} onChange={change} />
                  </div>
                  <Toggle checked={form.featured} onChange={(v) => setForm((f) => ({ ...f, featured: v }))} label="Featured" />
                </div>
              </FormSection>

              <FormSection title="Product page" description="The internal blog-style page owners see. Content is sanitised on save.">
                <div className="space-y-3">
                  <Input label="Hero title" value={form.portalPage.heroTitle} onChange={(e) => changePortal('heroTitle', e.target.value)} />
                  <Input label="Hero subtitle" value={form.portalPage.heroSubtitle} onChange={(e) => changePortal('heroSubtitle', e.target.value)} />
                  <Input label="Hero image URL" value={form.portalPage.heroImage} onChange={(e) => changePortal('heroImage', e.target.value)} />
                  <Input label="Hero video URL" value={form.portalPage.heroVideoUrl} onChange={(e) => changePortal('heroVideoUrl', e.target.value)} />
                  <Textarea label="Overview" rows={3} value={form.portalPage.overviewContent} onChange={(e) => changePortal('overviewContent', e.target.value)} />
                  <Textarea label="Getting started" rows={3} value={form.portalPage.gettingStartedContent} onChange={(e) => changePortal('gettingStartedContent', e.target.value)} />
                  <Textarea label="How it works" rows={3} value={form.portalPage.howItWorksContent} onChange={(e) => changePortal('howItWorksContent', e.target.value)} />
                  <div>
                    <span className="label">Page status</span>
                    <select className="input" value={form.portalPage.pageStatus} onChange={(e) => changePortal('pageStatus', e.target.value)}>
                      <option value="published">Published</option>
                      <option value="draft">Draft (owners preview only)</option>
                    </select>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Status">
                <Toggle
                  checked={form.active}
                  onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  label="Active"
                  description="Inactive products return 404 on their support URL."
                />
              </FormSection>
            </div>
          </div>

          <div className="space-y-6">
            {/* Team */}
            <div className="card p-5">
              <CardHeader
                title="Assigned agents"
                description="Agents see only the products they are assigned to. Managers and admins see everything."
              />
              <div className="space-y-2">
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
                        className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-500"
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
              <CardHeader
                icon={FlaskConical}
                title="Test retrieval"
                description="See exactly which knowledge a customer question retrieves for this product."
              />
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
