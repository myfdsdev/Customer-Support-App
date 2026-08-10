'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');
const { KnowledgeChunk, KnowledgeItem } = require('../../models');
const embeddings = require('../gemini/embeddings');
const vectorStore = require('./vectorStore');
const { tokenize, keywordMatch, keywordScore, truncate } = require('../../utils/text');

/**
 * Product-scoped knowledge retrieval.
 *
 * Every function here takes productId as a required argument and passes it as
 * a hard filter into the database query. There is no "search all products"
 * mode by design.
 */

const MAX_CONTEXT_CHARS = 9000;

/** A hit scoring below this fraction of the best hit is treated as noise. */
const RELATIVE_CUTOFF = 0.45;

/** Absolute floor for lexical matches — below this it is coincidence. */
const MIN_KEYWORD_SCORE = 0.34;

/** Lexical retrieval — Mongo $text first, then in-memory scoring as a net. */
async function keywordRetrieve({ productId, question, limit }) {
  const tokens = tokenize(question);
  if (!tokens.length) return [];

  let docs = [];
  try {
    docs = await KnowledgeChunk.find(
      { productId, active: true, $text: { $search: tokens.join(' ') } },
      { score: { $meta: 'textScore' } }
    )
      .select('knowledgeItemId productId title category content keywords chunkIndex')
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit * 2)
      .lean();
  } catch (err) {
    logger.debug(`Text search unavailable: ${err.message}`);
  }

  if (!docs.length) {
    docs = await KnowledgeChunk.find({ productId, active: true })
      .select('knowledgeItemId productId title category content keywords chunkIndex')
      .limit(400)
      .lean();
  }

  // Two gates, both required. A single incidental word ("product", "video")
  // matching a long article is not evidence the article answers the question,
  // and letting it through is how an ungrounded answer gets built.
  const minHits = Math.min(2, tokens.length);

  return docs
    .map((d) => {
      const m = keywordMatch(tokens, `${d.title}\n${d.content}`, d.keywords || []);
      return { ...d, score: m.score, hits: m.hits, strategy: 'keyword' };
    })
    .filter((d) => d.score >= MIN_KEYWORD_SCORE && d.hits >= minHits)
    .sort((a, b) => b.score - a.score || (a.chunkIndex || 0) - (b.chunkIndex || 0))
    .slice(0, limit);
}

/**
 * Merges vector and keyword hits. Vector hits keep their rank; keyword hits
 * fill remaining slots. Deduped by chunk id.
 */
function mergeResults(primary, secondary, limit) {
  const seen = new Set();
  const out = [];
  for (const list of [primary, secondary]) {
    for (const item of list) {
      const key = String(item._id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * @param {object} args
 * @param {string} args.productId REQUIRED — knowledge never crosses products
 * @param {string} args.question
 * @param {number} [args.topK]
 * @returns {Promise<{chunks: Array, strategy: string, embedded: boolean}>}
 */
async function retrieve({ productId, question, topK = env.rag.topK }) {
  if (!productId) throw new Error('retriever.retrieve requires a productId');
  if (!question || !question.trim()) return { chunks: [], strategy: 'none', embedded: false };

  let vectorHits = [];
  let embedded = false;

  if (embeddings.isEnabled()) {
    const vector = await embeddings.embedQuery(question);
    if (vector.length) {
      embedded = true;
      const raw = await vectorStore.search({ productId, vector, limit: topK });
      // Atlas returns 0..1 similarity; local cosine can be negative. Same gate.
      vectorHits = raw.filter((r) => r.score >= env.rag.minScore * 0.7);
    }
  }

  const keywordHits = await keywordRetrieve({ productId, question, limit: topK });
  const merged = mergeResults(vectorHits, keywordHits, topK);

  // Every merged chunk is re-verified against the tenant before it can be used.
  const scoped = merged.filter((c) => String(c.productId) === String(productId));

  // Drop trailing weak matches relative to the best hit. Feeding a loosely
  // related passage into the prompt is how a model ends up answering the
  // wrong question confidently.
  const top = scoped[0]?.score || 0;
  const kept = top > 0 ? scoped.filter((c) => c.score >= top * RELATIVE_CUTOFF) : scoped;

  // Chunks of the same article are equally scored by keyword search, so order
  // them by position. Without this, the passage containing step 1 can end up
  // behind the article's closing paragraph.
  const chunks = kept.sort(
    (a, b) => b.score - a.score || (a.chunkIndex || 0) - (b.chunkIndex || 0)
  );

  return {
    chunks,
    strategy: vectorHits.length ? vectorHits[0].strategy : keywordHits.length ? 'keyword' : 'none',
    embedded,
  };
}

/** Formats retrieved chunks into the bounded KNOWLEDGE block sent to Gemini. */
function buildContext(chunks, maxChars = MAX_CONTEXT_CHARS) {
  const out = [];
  let used = 0;
  for (const c of chunks) {
    const body = String(c.content || '');
    if (used + body.length > maxChars && out.length) break;
    out.push({
      id: String(c.knowledgeItemId || c._id),
      chunkId: String(c._id),
      chunkIndex: Number(c.chunkIndex || 0),
      title: c.title || '',
      category: c.category || '',
      content: body.slice(0, maxChars),
      score: Number(c.score || 0),
    });
    used += body.length;
  }
  return out;
}

/** Marks which knowledge articles actually got used (drives the "gaps" report). */
async function markUsage(knowledgeIds = []) {
  if (!knowledgeIds.length) return;
  await KnowledgeItem.updateMany(
    { _id: { $in: knowledgeIds } },
    { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }
  ).catch(() => null);
}

/** Public help-centre search (same tenant guarantee, article-level results). */
async function searchArticles({ productId, query, category, limit = 20 }) {
  const filter = { productId, active: true, status: 'published' };
  if (category) filter.category = category;

  if (!query) {
    return KnowledgeItem.find(filter)
      .select('title category summary content keywords updatedAt')
      .sort({ usageCount: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
  }

  const tokens = tokenize(query);
  const docs = await KnowledgeItem.find(filter)
    .select('title category summary content keywords updatedAt')
    .limit(300)
    .lean();

  return docs
    .map((d) => ({
      ...d,
      summary: d.summary || truncate(d.content, 200),
      _score: keywordScore(tokens, `${d.title}\n${d.content}`, d.keywords || []),
    }))
    .filter((d) => d._score > 0.1)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

module.exports = { retrieve, buildContext, markUsage, searchArticles, keywordRetrieve, MAX_CONTEXT_CHARS };
