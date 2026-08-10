/**
 * Inbox-row preview text, computed client-side so a new message can repaint a
 * conversation row without asking the server for the list again.
 *
 * Mirrors the server's `truncate(toPlain(content), 140)` so the optimistic row
 * matches what the next real fetch will contain.
 */

export function toPlainPreview(str = '') {
  return String(str)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(str = '', max = 140) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Preview line for a message, falling back to the attachment name. */
export function messagePreview(message) {
  if (!message) return '';
  const body = message.content || message.attachmentName || '';
  return truncate(toPlainPreview(body), 140);
}
