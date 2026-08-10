import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns';

export function timeAgo(date) {
  if (!date) return '';
  try {
    return `${formatDistanceToNowStrict(new Date(date))} ago`;
  } catch {
    return '';
  }
}

/** Compact stamp for inbox rows: 14:32 today, "Yesterday", then a date. */
export function shortTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'd MMM');
}

export const fullTime = (date) => (date ? format(new Date(date), 'd MMM yyyy, HH:mm') : '');
export const clockTime = (date) => (date ? format(new Date(date), 'HH:mm') : '');

export function duration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function videoDuration(seconds = 0) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

/** "waiting_customer" -> "Waiting for Customer" */
export function humanize(value = '') {
  const special = {
    waiting_customer: 'Waiting for Customer',
    waiting_team: 'Waiting for Team',
    in_progress: 'In Progress',
    super_admin: 'Super Admin',
    support_manager: 'Support Manager',
    support_agent: 'Support Agent',
    marketing_manager: 'Marketing Manager',
    support_homepage: 'Support Homepage',
    whats_new: "What's New",
    training_page: 'Training Page',
    after_resolution: 'After Resolution',
    knowledge_footer: 'Knowledge Article Footer',
  };
  if (special[value]) return special[value];
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const fileSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Minimal inline markdown for AI answers. Deliberately escapes HTML first so
 * model output can never inject markup into the page.
 */
export function renderInline(text = '') {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}
