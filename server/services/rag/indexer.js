'use strict';

const logger = require('../../utils/logger');
const { KnowledgeItem, KnowledgeChunk, TrainingVideo } = require('../../models');
const embeddings = require('../gemini/embeddings');
const { chunkContent } = require('./chunker');

/**
 * Rebuilds the chunk + embedding index for one knowledge item.
 * Safe to call on every create/update; it replaces the item's chunks wholesale.
 */
async function indexKnowledgeItem(itemOrId) {
  const item =
    typeof itemOrId === 'object' && itemOrId._id ? itemOrId : await KnowledgeItem.findById(itemOrId);
  if (!item) return { chunks: 0, embedded: false };

  await KnowledgeChunk.deleteMany({ knowledgeItemId: item._id });

  if (!item.active || item.status === 'draft') {
    await KnowledgeItem.updateOne(
      { _id: item._id },
      { $set: { chunkCount: 0, embeddingStatus: 'skipped', embeddedAt: new Date() } }
    );
    return { chunks: 0, embedded: false };
  }

  const pieces = chunkContent(item.content, { title: item.title });
  if (!pieces.length) return { chunks: 0, embedded: false };

  let vectors = pieces.map(() => []);
  let embedded = false;

  if (embeddings.isEnabled()) {
    try {
      vectors = await embeddings.embedDocuments(pieces.map((p) => p.content));
      embedded = vectors.some((v) => v.length > 0);
    } catch (err) {
      logger.warn(`Embedding knowledge item ${item._id} failed: ${err.message}`);
    }
  }

  const docs = pieces.map((p, i) => ({
    productId: item.productId,
    knowledgeItemId: item._id,
    title: item.title,
    category: item.category,
    content: p.content,
    keywords: item.keywords,
    chunkIndex: p.chunkIndex,
    embedding: vectors[i] || [],
    embeddingModel: (vectors[i] || []).length ? embeddings.modelName() : '',
    dim: (vectors[i] || []).length,
    active: true,
  }));

  await KnowledgeChunk.insertMany(docs);
  await KnowledgeItem.updateOne(
    { _id: item._id },
    {
      $set: {
        chunkCount: docs.length,
        embeddingStatus: embedded ? 'ready' : 'skipped',
        embeddedAt: new Date(),
      },
    }
  );

  return { chunks: docs.length, embedded };
}

async function removeKnowledgeItemIndex(itemId) {
  await KnowledgeChunk.deleteMany({ knowledgeItemId: itemId });
}

/** Embeds a training video's searchable text so it can be matched semantically. */
async function indexTrainingVideo(videoOrId) {
  const video =
    typeof videoOrId === 'object' && videoOrId._id ? videoOrId : await TrainingVideo.findById(videoOrId);
  if (!video) return false;
  if (!embeddings.isEnabled() || !video.active) return false;

  const text = [
    video.title,
    video.feature,
    video.description,
    (video.keywords || []).join(', '),
    (video.questionVariations || []).join(' | '),
  ]
    .filter(Boolean)
    .join('\n');

  const [vec] = await embeddings.embedDocuments([text]);
  if (!vec || !vec.length) return false;

  await TrainingVideo.updateOne(
    { _id: video._id },
    { $set: { embedding: vec, embeddingModel: embeddings.modelName() } }
  );
  return true;
}

/** Full rebuild, optionally scoped to a product. Used by `npm run reindex`. */
async function reindexAll({ productId = null } = {}) {
  const filter = productId ? { productId } : {};
  const items = await KnowledgeItem.find(filter).select('_id');
  const videos = await TrainingVideo.find(filter).select('_id');

  let chunks = 0;
  for (const it of items) {
    // eslint-disable-next-line no-await-in-loop
    const res = await indexKnowledgeItem(it._id);
    chunks += res.chunks;
  }
  for (const v of videos) {
    // eslint-disable-next-line no-await-in-loop
    await indexTrainingVideo(v._id);
  }

  return { items: items.length, chunks, videos: videos.length, embeddings: embeddings.isEnabled() };
}

module.exports = { indexKnowledgeItem, removeKnowledgeItemIndex, indexTrainingVideo, reindexAll };
