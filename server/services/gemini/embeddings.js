'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');
const client = require('./client');

/**
 * Replaceable embedding layer.
 *
 * `embed()` returns [] when no provider is configured. Every caller must treat
 * an empty vector as "fall back to keyword retrieval" rather than an error —
 * that is what lets the whole support flow work before a Gemini key exists.
 */

const MAX_BATCH = 32;

function normalizeVectorField(item) {
  if (!item) return [];
  if (Array.isArray(item)) return item;
  if (Array.isArray(item.values)) return item.values;
  if (Array.isArray(item.embedding)) return item.embedding;
  if (item.embedding && Array.isArray(item.embedding.values)) return item.embedding.values;
  return [];
}

async function embedBatch(texts, taskType) {
  const ai = client.getClient();
  if (!ai || !texts.length) return texts.map(() => []);

  try {
    const res = await ai.models.embedContent({
      model: env.gemini.embeddingModel,
      contents: texts,
      config: {
        taskType,
        outputDimensionality: env.gemini.embeddingDim,
      },
    });

    const list = res?.embeddings || res?.embedding || [];
    const arr = Array.isArray(list) ? list : [list];
    return texts.map((_, i) => normalizeVectorField(arr[i]));
  } catch (err) {
    logger.warn(`Embedding failed (${err.message}) — falling back to keyword retrieval.`);
    return texts.map(() => []);
  }
}

/** Embeds a stored document. */
async function embedDocuments(texts = []) {
  const out = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    // Sequential batches keep us inside free-tier rate limits during seeding.
    // eslint-disable-next-line no-await-in-loop
    const batch = await embedBatch(texts.slice(i, i + MAX_BATCH), 'RETRIEVAL_DOCUMENT');
    out.push(...batch);
  }
  return out;
}

/** Embeds a customer question. */
async function embedQuery(text) {
  if (!text) return [];
  const [vec] = await embedBatch([text], 'RETRIEVAL_QUERY');
  return vec || [];
}

const isEnabled = () => client.isEnabled();
const modelName = () => (client.isEnabled() ? env.gemini.embeddingModel : '');

module.exports = { embedDocuments, embedQuery, isEnabled, modelName, dimension: () => env.gemini.embeddingDim };
