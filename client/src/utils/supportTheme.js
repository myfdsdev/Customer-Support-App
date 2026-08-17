/**
 * How a product's immersive support page is styled and worded.
 *
 * The page reads from CSS custom properties throughout, so a product's saved
 * settings become one inline `style` on the stage element rather than a rebuild
 * or a pile of conditional classes. Anything a product has not set falls back
 * to the defaults below, which are the same values the stylesheet ships with —
 * so an unstyled product and a product styled to the defaults render
 * identically.
 */

export const SUPPORT_THEME_DEFAULTS = {
  /* Identity and copy */
  assistantName: '',
  assistantRole: 'Support Assistant',
  welcomeText: '',
  ctaText: 'Start the conversation',
  assistantAvatar: '',
  showOnlineDot: true,

  /* Background */
  bgFrom: '#020617',
  bgMid: '#040b22',
  bgTo: '#030718',
  glowColor: '#5846b4',

  /* Accent */
  accentFrom: '#ff8d1f',
  accentTo: '#59d6df',

  /* Message input bar */
  inputBg: '#ffffff',
  inputBorder: '#ffffff',
  inputText: '#ffffff',

  /* Floating controls */
  showSound: true,
  showClose: true,
  closeUrl: '',
};

/** `#rgb` and `#rrggbb` both in, `{ r, g, b }` out; null for anything else. */
function parseHex(value) {
  const hex = String(value || '').trim().replace('#', '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** A hex colour at a given alpha, falling back to the colour itself if unparseable. */
export function hexToRgba(value, alpha) {
  const c = parseHex(value);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})` : value;
}

function luminance(value) {
  const c = parseHex(value);
  if (!c) return 0;
  // Rec. 709, close enough to pick between a dark and a light label.
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/**
 * A label that stays readable across a two-stop gradient.
 *
 * One colour has to work at both ends, so the decision is made on the average
 * of the two rather than on either alone.
 */
function labelFor(from, to) {
  return (luminance(from) + luminance(to)) / 2 > 0.5 ? '#06182f' : '#ffffff';
}

/**
 * Fields where clearing the box is an instruction rather than an omission.
 *
 * Everywhere else a blank value means "use the default" — a blank colour is
 * not a colour, and a blank button has no label. The sub-label is the one
 * place where empty legitimately means "don't show this line", so it is the
 * one field allowed to survive as an empty string.
 */
const ALLOW_EMPTY = new Set(['assistantRole']);

/** A product's saved settings merged over the defaults. */
export function resolveSupportTheme(product) {
  const saved = product?.supportPage || {};
  const theme = { ...SUPPORT_THEME_DEFAULTS };

  Object.keys(SUPPORT_THEME_DEFAULTS).forEach((key) => {
    const value = saved[key];
    if (typeof SUPPORT_THEME_DEFAULTS[key] === 'boolean') {
      if (typeof value === 'boolean') theme[key] = value;
    } else if (typeof value === 'string' && (value.trim() || ALLOW_EMPTY.has(key))) {
      theme[key] = value.trim();
    }
  });

  return theme;
}

/**
 * The custom properties the immersive stylesheet reads. Spread onto the stage's
 * `style` — every rule that consumes one also carries the default as its
 * fallback, so a missing property is never a broken screen.
 */
export function supportThemeVars(theme) {
  return {
    '--sp-bg-from': theme.bgFrom,
    '--sp-bg-mid': theme.bgMid,
    '--sp-bg-to': theme.bgTo,
    '--sp-glow': hexToRgba(theme.glowColor, 0.2),

    '--sp-accent-from': theme.accentFrom,
    '--sp-accent-to': theme.accentTo,
    '--sp-accent-glow-a': hexToRgba(theme.accentFrom, 0.22),
    '--sp-accent-glow-b': hexToRgba(theme.accentTo, 0.25),
    '--sp-accent-glow-a-strong': hexToRgba(theme.accentFrom, 0.34),
    '--sp-accent-glow-b-strong': hexToRgba(theme.accentTo, 0.38),
    '--sp-cta-text': labelFor(theme.accentFrom, theme.accentTo),

    // Tints over the dark bar rather than fills: the composer is glass, and a
    // solid fill would flatten it against the background.
    '--sp-input-bg': hexToRgba(theme.inputBg, 0.08),
    '--sp-input-border': hexToRgba(theme.inputBorder, 0.16),
    '--sp-input-text': theme.inputText,
    '--sp-input-placeholder': hexToRgba(theme.inputText, 0.45),
  };
}

/** The assistant's display name — its own, or the product's. */
export function assistantNameFor(product, theme) {
  return theme.assistantName || product?.name || 'Support';
}
