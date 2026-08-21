'use strict';

const { Product, KnowledgeItem, TrainingVideo } = require('../../models');
const { KNOWLEDGE_CATEGORIES } = require('../../utils/constants');
const rag = require('../rag');
const logger = require('../../utils/logger');

/**
 * JSON → knowledge base importer.
 *
 * Lets an operator feed the AI without touching the admin forms: drop a JSON
 * file (see server/knowledge-imports/README) and every article + video in it is
 * upserted into the EXISTING product-scoped knowledge base and immediately
 * chunked + embedded through the same RAG pipeline the admin UI uses. So the
 * assistant answers from it right away, product-scoped, with the same grounding
 * rules — no second answer engine.
 *
 * Idempotent: items are upserted by (productId, title), so re-running the same
 * file updates in place instead of creating duplicates.
 */

const CATEGORY_SET = new Set(KNOWLEDGE_CATEGORIES);

/** Coerces an arbitrary category string onto the allowed enum, never throwing. */
function normalizeCategory(value) {
  const raw = String(value || '').trim();
  if (CATEGORY_SET.has(raw)) return raw;
  // Case-insensitive match against the enum.
  const hit = KNOWLEDGE_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (hit) return hit;
  return 'FAQs'; // safe default so an unknown category never blocks an import
}

const toArray = (v) =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

/** Resolves the internal product from a slug or name hint. */
async function resolveProduct(hint) {
  const value = String(hint || '').trim();
  if (!value) return null;
  const bySlug = await Product.findOne({ slug: value.toLowerCase() });
  if (bySlug) return bySlug;
  return Product.findOne({ name: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
}

/**
 * Reads the flexible JSON shape into { productHint, knowledge[], videos[] }.
 * Accepts:
 *   { product, knowledge:[...], videos:[...] }
 *   { productSlug, articles:[...] }
 *   [ {title, content, ... }, ... ]   (a bare array of articles)
 */
function parseShape(json, fallbackProduct) {
  if (Array.isArray(json)) {
    return { productHint: fallbackProduct, knowledge: json, videos: [] };
  }
  const productHint = json.product || json.productSlug || json.slug || fallbackProduct;
  const knowledge = json.knowledge || json.articles || json.kb || json.items || [];
  const videos = json.videos || json.training || json.trainingVideos || [];
  return { productHint, knowledge, videos };
}

/**
 * Imports one already-parsed JSON object.
 *
 * @param {object} json           parsed JSON
 * @param {object} [opts]
 * @param {string} [opts.productHint]  slug/name used when the JSON omits one
 * @param {ObjectId} [opts.actorId]    admin performing the import (audit only)
 * @returns {{ product, knowledge:{created,updated,failed,chunks}, videos:{created,updated,failed}, errors:string[] }}
 */
async function importFromObject(json, { productHint: hintOverride = '', actorId = null } = {}) {
  const { productHint, knowledge, videos } = parseShape(json, hintOverride);

  const product = await resolveProduct(productHint);
  if (!product) {
    const err = new Error(
      `Could not resolve a product from "${productHint}". Add a "product" field (slug) to the JSON, or name the file <slug>.json.`
    );
    err.statusCode = 400;
    throw err;
  }

  const result = {
    product: { _id: product._id, name: product.name, slug: product.slug },
    knowledge: { created: 0, updated: 0, failed: 0, chunks: 0 },
    videos: { created: 0, updated: 0, failed: 0 },
    errors: [],
  };

  // --- Knowledge articles --------------------------------------------------
  for (const raw of Array.isArray(knowledge) ? knowledge : []) {
    const title = String(raw.title || raw.question || '').trim();
    const content = String(raw.content || raw.answer || raw.body || '').trim();
    if (!title || !content) {
      result.knowledge.failed += 1;
      result.errors.push(`Skipped an article missing title/content: "${title || '(no title)'}"`);
      continue;
    }
    try {
      const existing = await KnowledgeItem.findOne({ productId: product._id, title });
      const doc = {
        productId: product._id,
        title,
        content: content.slice(0, 60000),
        category: normalizeCategory(raw.category),
        summary: String(raw.summary || '').slice(0, 1000),
        keywords: toArray(raw.keywords),
        tags: toArray(raw.tags),
        sourceType: 'import',
        sourceUrl: String(raw.sourceUrl || raw.url || ''),
        active: raw.active !== false,
        status: raw.status === 'draft' ? 'draft' : 'published',
        updatedBy: actorId,
      };

      let item;
      if (existing) {
        Object.assign(existing, doc);
        item = await existing.save();
        result.knowledge.updated += 1;
      } else {
        item = await KnowledgeItem.create({ ...doc, createdBy: actorId });
        result.knowledge.created += 1;
      }

      // Same indexing path the admin create/update uses → chunks + embeddings.
      const indexed = await rag.indexKnowledgeItem(item);
      result.knowledge.chunks += indexed.chunks || 0;
    } catch (err) {
      result.knowledge.failed += 1;
      result.errors.push(`Article "${title}": ${err.message}`);
    }
  }

  // --- Training videos (optional) -----------------------------------------
  for (const raw of Array.isArray(videos) ? videos : []) {
    const title = String(raw.title || '').trim();
    const videoUrl = String(raw.videoUrl || raw.url || '').trim();
    if (!title || !videoUrl) {
      result.videos.failed += 1;
      result.errors.push(`Skipped a video missing title/videoUrl: "${title || '(no title)'}"`);
      continue;
    }
    try {
      const existing = await TrainingVideo.findOne({ productId: product._id, title });
      const doc = {
        productId: product._id,
        title,
        videoUrl,
        description: String(raw.description || '').slice(0, 4000),
        feature: String(raw.feature || '').trim(),
        category: raw.category && [...KNOWLEDGE_CATEGORIES, 'Tutorial'].includes(raw.category) ? raw.category : 'Tutorial',
        keywords: toArray(raw.keywords),
        questionVariations: toArray(raw.questionVariations),
        thumbnailUrl: String(raw.thumbnailUrl || ''),
        duration: Number(raw.duration) || 0,
        active: raw.active !== false,
      };

      let video;
      if (existing) {
        Object.assign(existing, doc);
        video = await existing.save();
        result.videos.updated += 1;
      } else {
        video = await TrainingVideo.create(doc);
        result.videos.created += 1;
      }
      await rag.indexTrainingVideo(video).catch(() => null);
    } catch (err) {
      result.videos.failed += 1;
      result.errors.push(`Video "${title}": ${err.message}`);
    }
  }

  logger.info(
    `JSON import → ${product.name}: kb +${result.knowledge.created}/${result.knowledge.updated} ` +
      `(${result.knowledge.chunks} chunks), videos +${result.videos.created}/${result.videos.updated}`
  );
  return result;
}

module.exports = { importFromObject, resolveProduct, normalizeCategory };
