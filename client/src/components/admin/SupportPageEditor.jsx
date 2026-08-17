import React from 'react';
import { Palette, RotateCcw, ExternalLink } from 'lucide-react';
import FormSection, { CardHeader } from './FormSection';
import { Button, Input, Textarea, Toggle } from '../ui';

/** A colour swatch and its hex, kept in step. */
function ColourField({ id, label, value, onChange }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded border border-ink-300"
        />
        <input
          className="input min-w-0 !text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
}

/**
 * Everything a product can change about its own support page.
 *
 * `theme` is the resolved settings held in the parent's form state, so every
 * field always has a concrete value to show and saving writes back exactly
 * what the customer-facing page will use.
 */
export default function SupportPageEditor({ product, theme, slug, onChange, onReset }) {
  return (
    <div className="card p-5 sm:p-6">
      <CardHeader
        icon={Palette}
        title="Support page"
        description={`How /support/${slug} looks and reads. Changes apply after you save.`}
        actions={
          <>
            <a href={`/support/${slug}`} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 !text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> Open the page
            </a>
            <Button variant="secondary" size="sm" onClick={onReset}>
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <FormSection title="Name and text">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Assistant name"
                value={theme.assistantName}
                onChange={(e) => onChange('assistantName', e.target.value)}
                placeholder={product.name}
                hint="Leave empty to use the product name."
              />
              <Input
                label="Sub-label"
                value={theme.assistantRole}
                onChange={(e) => onChange('assistantRole', e.target.value)}
                placeholder="Support Assistant"
                hint="The small line under the name. Empty hides it."
              />
            </div>

            <Textarea
              label="Welcome text"
              rows={2}
              value={theme.welcomeText}
              onChange={(e) => onChange('welcomeText', e.target.value)}
              hint="Shown on the welcome screen only. Empty falls back to the AI welcome message."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Button text"
                value={theme.ctaText}
                onChange={(e) => onChange('ctaText', e.target.value)}
                placeholder="Start the conversation"
              />
              <Input
                label="Assistant avatar URL"
                value={theme.assistantAvatar}
                onChange={(e) => onChange('assistantAvatar', e.target.value)}
                hint="Empty uses the product logo."
              />
            </div>
          </div>
        </FormSection>

        <FormSection title="Background" description="Left to right across the screen, plus the light behind the assistant.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ColourField id="sp-bg-from" label="Left" value={theme.bgFrom} onChange={(v) => onChange('bgFrom', v)} />
            <ColourField id="sp-bg-mid" label="Middle" value={theme.bgMid} onChange={(v) => onChange('bgMid', v)} />
            <ColourField id="sp-bg-to" label="Right" value={theme.bgTo} onChange={(v) => onChange('bgTo', v)} />
            <ColourField id="sp-glow" label="Centre glow" value={theme.glowColor} onChange={(v) => onChange('glowColor', v)} />
          </div>
        </FormSection>

        <FormSection
          title="Accent"
          description="The button gradient, the send key and the sub-label. The label colour is chosen automatically so it stays readable."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ColourField id="sp-accent-from" label="Gradient start" value={theme.accentFrom} onChange={(v) => onChange('accentFrom', v)} />
            <ColourField id="sp-accent-to" label="Gradient end" value={theme.accentTo} onChange={(v) => onChange('accentTo', v)} />
          </div>
        </FormSection>

        <FormSection
          title="Message box"
          description="The fill and border are applied as a tint over the dark bar, so it stays glass rather than turning into a solid block."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ColourField id="sp-input-bg" label="Fill tint" value={theme.inputBg} onChange={(v) => onChange('inputBg', v)} />
            <ColourField id="sp-input-border" label="Border tint" value={theme.inputBorder} onChange={(v) => onChange('inputBorder', v)} />
            <ColourField id="sp-input-text" label="Typed text" value={theme.inputText} onChange={(v) => onChange('inputText', v)} />
          </div>
        </FormSection>

        <FormSection title="Controls">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3.5">
              <Toggle
                checked={theme.showSound}
                onChange={(v) => onChange('showSound', v)}
                label="Sound button"
                description="A stored mute preference. No notification audio is wired up yet."
              />
              <Toggle
                checked={theme.showClose}
                onChange={(v) => onChange('showClose', v)}
                label="Close button"
                description="On the chat screen it always returns to the welcome screen."
              />
              <Toggle
                checked={theme.showOnlineDot}
                onChange={(v) => onChange('showOnlineDot', v)}
                label="Green online dot"
                description="The presence dot on the assistant avatar."
              />
            </div>

            <div>
              <Input
                label="Close goes to"
                value={theme.closeUrl}
                onChange={(e) => onChange('closeUrl', e.target.value)}
                placeholder={product.websiteUrl || 'https://example.com'}
                hint="Where closing the welcome screen sends the customer. Empty uses the website URL."
              />
            </div>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
