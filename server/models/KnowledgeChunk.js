'use strict';

const mongoose = require('mongoose');

/**
 * One retrievable passage of a KnowledgeItem.
 *
 * This exists as its own collection because MongoDB Atlas `$vectorSearch`
 * requires the vector at a top-level document path — you cannot index an
 * embedding nested inside an array of sub-documents. Chunking here is also
 * what keeps us from ever shipping a whole knowledge base to Gemini.
 */
const knowledgeChunkSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    knowledgeItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeItem', required: true, index: true },

    title: { type: String, default: '' },
    category: { type: String, default: '' },
    content: { type: String, required: true },
    keywords: { type: [String], default: [] },
    chunkIndex: { type: Number, default: 0 },

    /** Dense vector; empty when no embedding provider is configured. */
    embedding: { type: [Number], default: [] },
    embeddingModel: { type: String, default: '' },
    dim: { type: Number, default: 0 },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

knowledgeChunkSchema.index({ productId: 1, active: 1 });
knowledgeChunkSchema.index({ content: 'text', title: 'text', keywords: 'text' });

module.exports = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
