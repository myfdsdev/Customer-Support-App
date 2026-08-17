import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Users, Paperclip, X } from 'lucide-react';
import { Spinner, ErrorState, EmptyState, Select, Textarea, Button, ProductLogo } from '../../components/ui';
import { portalService, toMessage } from '../../services/portalApi';
import { RecentConversationCard } from '../../components/portal/cards';

/**
 * Support selection page. Exactly two support types — AI and Team — and no
 * "request a call" or other channels, per spec. The intake (product, category,
 * description, optional attachment) is carried into the chat as the opening
 * message so the agent/AI sees full context in the existing conversation.
 */
export default function Support() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  const [form, setForm] = useState({ productId: '', category: '', description: '' });
  const [file, setFile] = useState(null);

  const load = async () => {
    setError('');
    try {
      const [sp, convos] = await Promise.all([portalService.supportProducts(), portalService.conversations()]);
      setData(sp);
      setConversations(convos || []);
      // Preselect a product if the URL asked for one, else the only product.
      const preferred = params.get('product');
      const match = sp.products.find((p) => p.slug === preferred) || (sp.products.length === 1 ? sp.products[0] : null);
      if (match) setForm((f) => ({ ...f, productId: match._id }));
    } catch (err) {
      setError(toMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedProduct = useMemo(
    () => data?.products.find((p) => p._id === form.productId) || null,
    [data, form.productId]
  );

  const start = async (mode) => {
    if (!form.productId) {
      setError('Please choose a product first.');
      return;
    }
    setStarting(mode);
    setError('');
    try {
      const slug = selectedProduct.slug;
      // Server verifies ownership; we only pass the intake context.
      await portalService.startSupport(slug, {
        mode: mode === 'team' ? 'team' : 'ai',
        category: form.category,
        description: form.description,
      });
      // Hand the intake to the chat page via router state so it can open the
      // conversation with the issue category + description as the first message.
      navigate(`/portal/support/${slug}/${mode === 'team' ? 'team' : 'ai'}`, {
        state: { category: form.category, description: form.description, fileName: file?.name || '' },
      });
    } catch (err) {
      setError(toMessage(err));
      setStarting('');
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading support…" />
      </div>
    );
  }

  if (!data.products.length) {
    return (
      <EmptyState
        icon={Bot}
        title="No products to get support for"
        description="Support is available for products linked to your account. Link a purchase to get started."
        action={<Button onClick={() => navigate('/portal/products')}>Go to my products</Button>}
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">Support</h1>
      <p className="mt-1 text-ink-500">Tell us what you need help with, then choose how you’d like to chat.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Intake form */}
        <div className="card p-6">
          {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="space-y-4">
            <Select
              label="Which product?"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Select a product…</option>
              {data.products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="What’s the issue about?"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select a category…</option>
              {data.issueCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>

            <Textarea
              label="Describe your issue"
              rows={4}
              placeholder="Tell us what’s happening…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            {/* Optional attachment — the file is attached once the chat opens. */}
            <div>
              <span className="label">Attachment (optional)</span>
              {file ? (
                <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 truncate text-ink-700">
                    <Paperclip className="h-4 w-4" /> {file.name}
                  </span>
                  <button type="button" onClick={() => setFile(null)} className="text-ink-400 hover:text-ink-700">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-2 text-sm text-ink-500 hover:bg-ink-50">
                  <Paperclip className="h-4 w-4" />
                  <span>Attach a screenshot or file</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.txt,.csv,.zip"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>

            {/* The two — and only two — support types */}
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => start('ai')}
                disabled={Boolean(starting)}
                className="flex items-center gap-3 rounded-xl border border-ink-200 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-700">
                  <Bot className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink-900">Get Instant Help</span>
                  <span className="block text-xs text-ink-500">Chat with AI</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => start('team')}
                disabled={Boolean(starting)}
                className="flex items-center gap-3 rounded-xl border border-ink-200 p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-60"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Users className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink-900">Chat with Our Team</span>
                  <span className="block text-xs text-ink-500">Talk to a real person</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Recent conversations panel */}
        <aside>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Recent conversations</h2>
          {conversations.length ? (
            <div className="space-y-2">
              {conversations.slice(0, 8).map((c) => (
                <RecentConversationCard key={c._id} conversation={c} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
              Your conversations will show up here.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
