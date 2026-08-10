'use strict';

const mongoose = require('mongoose');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { KnowledgeChunk } = require('../../models');
const { cosineSimilarity } = require('../../utils/text');

/**
 * Three retrieval strategies behind one interface, tried in order:
 *
 *   1. Atlas $vectorSearch  — real ANN index, scales to large knowledge bases
 *   2. in-process cosine    — exact, product-scoped, fine up to a few thousand chunks
 *   3. (caller falls back to keyword search when no vector exists at all)
 *
 * `productId` is a required argument on every path. There is no code path in
 * this file that can return a chunk belonging to another product.
 */

let atlasUsable = env.rag.atlasVectorSearch;
let atlasWarned = false;

function oid(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

async function atlasSearch({ productId, vector, limit }) {
  const pipeline = [
    {
      $vectorSearch: {
        index: env.rag.vectorIndexName,
        path: 'embedding',
        queryVector: vector,
        numCandidates: Math.max(100, limit * 20),
        limit,
        // Hard tenant filter — applied inside the vector stage, not after it.
        filter: { productId: oid(productId), active: true },
      },
    },
    {
      $project: {
        _id: 1,
        knowledgeItemId: 1,
        productId: 1,
        title: 1,
        category: 1,
        content: 1,
        keywords: 1,
        chunkIndex: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  return KnowledgeChunk.aggregate(pipeline);
}

async function localSearch({ productId, vector, limit }) {
  const chunks = await KnowledgeChunk.find({
    productId: oid(productId),
    active: true,
    'embedding.0': { $exists: true },
  })
    .select('knowledgeItemId productId title category content keywords chunkIndex embedding')
    .lean();

  if (!chunks.length) return [];

  return chunks
    .map((c) => ({ ...c, score: cosineSimilarity(vector, c.embedding), embedding: undefined }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * @param {object} args
 * @param {string} args.productId  REQUIRED tenant filter
 * @param {number[]} args.vector   query embedding
 * @param {number} [args.limit]
 * @returns {Promise<Array>} scored chunks, highest first
 */
async function search({ productId, vector, limit = env.rag.topK }) {
  if (!productId) throw new Error('vectorStore.search requires a productId');
  if (!Array.isArray(vector) || !vector.length) return [];

  if (atlasUsable) {
    try {
      const res = await atlasSearch({ productId, vector, limit });
      if (res.length) return res.map((r) => ({ ...r, strategy: 'atlas_vector' }));
    } catch (err) {
      // Missing index / unsupported deployment: stop trying and use exact search.
      atlasUsable = false;
      if (!atlasWarned) {
        atlasWarned = true;
        logger.warn(`Atlas $vectorSearch unavailable (${err.message}). Using in-process cosine similarity instead.`);
      }
    }
  }

  const res = await localSearch({ productId, vector, limit });
  return res.map((r) => ({ ...r, strategy: 'local_cosine' }));
}

function status() {
  return {
    atlasConfigured: env.rag.atlasVectorSearch,
    atlasUsable,
    indexName: env.rag.vectorIndexName,
  };
}

module.exports = { search, status };
