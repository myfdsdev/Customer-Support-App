import React from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, Toggle } from '../ui';
import cn from '../../utils/cn';

/**
 * Editor for a product's customer-facing page (`product.portalPage`).
 *
 * Everything the page renders is editable here — the hero, the prose sections,
 * the feature cards, the FAQ list, the quick links, and which sections appear
 * and in what order. Nothing is free-form HTML: each list is a typed row, which
 * is why the server can sanitise it field by field rather than trusting markup.
 *
 * The section list below MUST stay in step with PRODUCT_PAGE_SECTIONS in
 * server/utils/constants.js — the server drops any key it does not recognise,
 * so a stale entry here silently does nothing rather than breaking a save.
 */
const SECTIONS = [
  { key: 'hero', label: 'Hero', hint: 'Always shown' },
  { key: 'overview', label: 'Product Overview' },
  { key: 'tutorials', label: 'Product Videos' },
  { key: 'features', label: 'Key Features' },
  { key: 'getting_started', label: 'Getting Started' },
  { key: 'how_it_works', label: 'How It Works' },
  { key: 'updates', label: 'Updates' },
  { key: 'resources', label: 'Quick Links', hint: 'Side rail' },
  { key: 'faq', label: 'FAQs' },
  { key: 'support', label: 'Need Help?', hint: 'Side rail' },
  { key: 'related', label: 'Recommended for You', hint: 'Side rail' },
];

const LINK_KINDS = [
  { value: 'link', label: 'Link' },
  { value: 'doc', label: 'Documentation' },
  { value: 'download', label: 'Download' },
  { value: 'video', label: 'Video' },
];

/** A list block with add / remove / reorder, used for all three row types. */
function RowList({ title, description, items, onChange, blank, addLabel, children }) {
  const update = (i, patch) => onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));
  const remove = (i) => onChange(items.filter((_, n) => n !== i));
  const move = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          {description && <p className="text-xs text-ink-500">{description}</p>}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...items, { ...blank }])}>
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">
          Nothing here yet — this section is hidden from the page until you add one.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-ink-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-ink-400">#{i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30" aria-label="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30" aria-label="Move down">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(i)}
                    className="rounded p-1 text-red-500 hover:bg-red-50" aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {children(item, (patch) => update(i, patch))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export default function ProductPageEditor({ value, onChange }) {
  const page = value || {};
  const set = (key, v) => onChange({ ...page, [key]: v });

  const order = page.sectionOrder?.length ? page.sectionOrder : SECTIONS.map((s) => s.key);
  const visible = new Set(page.visibleSections?.length ? page.visibleSections : SECTIONS.map((s) => s.key));
  const byKey = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
  // Anything stored but unknown to this build is dropped from the editor rather
  // than rendered blank; the server would ignore it on save anyway.
  const rows = order.filter((k) => byKey[k]);

  const toggleSection = (key) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set('visibleSections', rows.filter((k) => next.has(k)));
  };

  const moveSection = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[i], next[to]] = [next[to], next[i]];
    onChange({ ...page, sectionOrder: next, visibleSections: next.filter((k) => visible.has(k)) });
  };

  return (
    <div className="space-y-7">
      {/* Hero */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink-900">Header</p>
        <Input label="Hero title" value={page.heroTitle || ''} onChange={(e) => set('heroTitle', e.target.value)}
          hint="Falls back to the product name." />
        <Input label="Hero subtitle" value={page.heroSubtitle || ''} onChange={(e) => set('heroSubtitle', e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Hero image URL" value={page.heroImage || ''} onChange={(e) => set('heroImage', e.target.value)}
            hint="Shown beside the header. Leave blank to hide." />
          <Input label="Hero video URL" value={page.heroVideoUrl || ''} onChange={(e) => set('heroVideoUrl', e.target.value)} />
        </div>
      </div>

      {/* Prose */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink-900">Written sections</p>
        <Textarea label="Product Overview" rows={4} value={page.overviewContent || ''}
          onChange={(e) => set('overviewContent', e.target.value)} />
        <Textarea label="Getting Started" rows={4} value={page.gettingStartedContent || ''}
          onChange={(e) => set('gettingStartedContent', e.target.value)} />
        <Textarea label="How It Works" rows={4} value={page.howItWorksContent || ''}
          onChange={(e) => set('howItWorksContent', e.target.value)} />
      </div>

      <RowList
        title="Key Features"
        description="Rendered as a card grid."
        items={page.featureItems || []}
        onChange={(v) => set('featureItems', v)}
        blank={{ title: '', description: '' }}
        addLabel="Add feature"
      >
        {(item, patch) => (
          <div className="space-y-2">
            <Input label="Title" value={item.title || ''} onChange={(e) => patch({ title: e.target.value })} />
            <Textarea label="Description" rows={2} value={item.description || ''}
              onChange={(e) => patch({ description: e.target.value })} />
          </div>
        )}
      </RowList>

      <RowList
        title="FAQs"
        description="Shown as an accordion at the foot of the page."
        items={page.faqItems || []}
        onChange={(v) => set('faqItems', v)}
        blank={{ question: '', answer: '' }}
        addLabel="Add question"
      >
        {(item, patch) => (
          <div className="space-y-2">
            <Input label="Question" value={item.question || ''} onChange={(e) => patch({ question: e.target.value })} />
            <Textarea label="Answer" rows={3} value={item.answer || ''} onChange={(e) => patch({ answer: e.target.value })} />
          </div>
        )}
      </RowList>

      <RowList
        title="Quick Links"
        description="Appear in the side rail."
        items={page.resourceLinks || []}
        onChange={(v) => set('resourceLinks', v)}
        blank={{ label: '', url: '', description: '', kind: 'link' }}
        addLabel="Add link"
      >
        {(item, patch) => (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
              <Input label="Label" value={item.label || ''} onChange={(e) => patch({ label: e.target.value })} />
              <div>
                <span className="label">Type</span>
                <select className="input" value={item.kind || 'link'} onChange={(e) => patch({ kind: e.target.value })}>
                  {LINK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
            </div>
            <Input label="URL" value={item.url || ''} onChange={(e) => patch({ url: e.target.value })} />
            <Input label="Short description" value={item.description || ''}
              onChange={(e) => patch({ description: e.target.value })} />
          </div>
        )}
      </RowList>

      {/* Sections */}
      <div>
        <p className="text-sm font-semibold text-ink-900">Sections</p>
        <p className="text-xs text-ink-500">Untick to hide a section, or reorder it. A section with no content stays hidden either way.</p>
        <div className="mt-3 divide-y divide-ink-100 rounded-lg border border-ink-200">
          {rows.map((key, i) => {
            const s = byKey[key];
            const on = visible.has(key);
            return (
              <div key={key} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleSection(key)}
                  className="h-4 w-4 rounded border-ink-300"
                  aria-label={`Show ${s.label}`}
                />
                <span className={cn('flex-1 text-sm', on ? 'text-ink-800' : 'text-ink-400 line-through')}>
                  {s.label}
                  {s.hint && <span className="ml-2 text-xs text-ink-400">{s.hint}</span>}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30" aria-label="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => moveSection(i, 1)} disabled={i === rows.length - 1}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30" aria-label="Move down">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Switches + status */}
      <div className="space-y-3">
        <Toggle
          checked={page.showTutorials !== false}
          onChange={(v) => set('showTutorials', v)}
          label="Show product videos"
          description="Pulls this product's training videos into the page."
        />
        <Toggle
          checked={page.showRelated !== false}
          onChange={(v) => set('showRelated', v)}
          label="Show recommendations"
          description="Uses marketing recommendations placed on the product page."
        />
        <div>
          <span className="label">Page status</span>
          <select className="input" value={page.pageStatus || 'published'} onChange={(e) => set('pageStatus', e.target.value)}>
            <option value="published">Published</option>
            <option value="draft">Draft (owners preview only)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
