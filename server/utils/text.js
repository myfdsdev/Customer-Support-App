'use strict';

const STOPWORDS = new Set(
  ('a an and are as at be but by can cant do does doesnt for from get got had has have how i if in into is it its me my of on or our so that the their then there these they this to us was we what when where which who why will with you your please help need want'
  ).split(' ')
);

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[`'’]/g, '')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Content words only — used for keyword scoring and fallback retrieval. */
function tokenize(str = '') {
  return normalize(str)
    .split(' ')
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function uniq(arr = []) {
  return [...new Set(arr)];
}

/**
 * Overlap between a query and a bag of terms.
 *
 * Deliberately simple: this is the last-resort retrieval layer when no
 * embeddings are available, not the primary ranker. `hits` is returned
 * alongside the score because a single incidental word match ("product") must
 * not be allowed to look like a real match — callers gate on both.
 */
function keywordMatch(queryTokens, targetText, boostTerms = []) {
  if (!queryTokens.length) return { score: 0, hits: 0, total: 0 };
  const target = normalize(targetText);
  const boost = boostTerms.map(normalize).filter(Boolean);

  let hits = 0;
  let boosted = 0;
  for (const t of queryTokens) {
    if (target.includes(t)) hits += 1;
    if (boost.some((b) => b.includes(t) || t.includes(b))) boosted += 1;
  }
  const base = hits / queryTokens.length;
  const bonus = boost.length ? (boosted / queryTokens.length) * 0.35 : 0;
  return { score: Math.min(1, base * 0.8 + bonus), hits, total: queryTokens.length };
}

function keywordScore(queryTokens, targetText, boostTerms = []) {
  return keywordMatch(queryTokens, targetText, boostTerms).score;
}

function cosineSimilarity(a = [], b = []) {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function truncate(str = '', max = 160) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Strip markdown so a preview line in the inbox stays readable. */
function toPlain(str = '') {
  return String(str)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  normalize,
  tokenize,
  uniq,
  keywordMatch,
  keywordScore,
  cosineSimilarity,
  truncate,
  toPlain,
  STOPWORDS,
};
