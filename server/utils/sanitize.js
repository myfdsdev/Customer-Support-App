'use strict';

/**
 * Server-side sanitisation for admin-authored customer-facing content.
 *
 * The portal deliberately stores STRUCTURED content (typed sections, feature
 * items, FAQ pairs) rather than a blob of HTML, so there is no legitimate
 * reason for markup to appear in any of these fields. Rather than ship an
 * allowlist HTML parser and then have to defend it, the rules here are
 * simple and closed: strip tags entirely and keep the text.
 *
 * The client renders these values as plain text with `white-space: pre-wrap`,
 * never via dangerouslySetInnerHTML, so this is defence in depth rather than
 * the only line of defence.
 */

/** Tags whose *contents* are dangerous too, not just the tag itself. */
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
/** An unclosed dangerous tag — strip from the tag to the end of the input. */
const DANGEROUS_OPEN = /<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*$/gi;
const ANY_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Strips markup from a string and collapses the runaway blank lines that
 * pasting from a rich editor tends to leave behind.
 */
function sanitizeText(value, maxLength = 20000) {
  if (value === null || value === undefined) return '';
  let text = String(value);

  text = text.replace(HTML_COMMENT, '');
  text = text.replace(DANGEROUS_BLOCKS, '');
  text = text.replace(DANGEROUS_OPEN, '');
  text = text.replace(ANY_TAG, '');

  // Decode the handful of entities an editor emits, so "&amp;" does not
  // survive as literal text. Deliberately not a general entity decoder: the
  // output is rendered as text, so nothing here can become markup again.
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Re-strip: an entity-encoded tag becomes a real one after decoding.
  text = text.replace(ANY_TAG, '');

  text = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();

  return text.slice(0, maxLength);
}

/**
 * URL allowlist for anything the portal will render as a link, image or video.
 *
 * Only http(s) and site-relative paths survive. This is what stops an admin
 * (or anyone who reaches an admin session) from turning a "Resources" link
 * into `javascript:` or a `data:text/html` payload.
 */
function sanitizeUrl(value, { allowRelative = true } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('//')) return ''; // protocol-relative: ambiguous, disallow
  if (raw.startsWith('/')) return allowRelative ? raw.slice(0, 2000) : '';

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 2000);
  } catch {
    return '';
  }
}

/** Sanitises every string in an array of plain objects, field by field. */
function sanitizeItems(items, spec, limit = 50) {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, limit).map((item) => {
    const out = {};
    for (const [key, rule] of Object.entries(spec)) {
      const value = item?.[key];
      if (rule.url) out[key] = sanitizeUrl(value);
      else out[key] = sanitizeText(value, rule.max || 1000);
    }
    return out;
  });
}

module.exports = { sanitizeText, sanitizeUrl, sanitizeItems };
