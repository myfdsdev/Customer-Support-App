'use strict';

const mongoose = require('mongoose');
const { KNOWLEDGE_CATEGORIES } = require('../utils/constants');

const knowledgeItemSchema = new mongoose.Schema(
  {
    /** Required and always filtered on: knowledge never crosses products. */
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    category: { type: String, enum: KNOWLEDGE_CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    content: { type: String, required: true, maxlength: 60000 },
    summary: { type: String, default: '', maxlength: 1000 },

    keywords: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },

    sourceType: {
      type: String,
      enum: ['manual', 'doc', 'faq', 'url', 'import', 'macro'],
      default: 'manual',
    },
    sourceUrl: { type: String, default: '' },

    /** Disabled items are excluded from every retrieval path. */
    active: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published', index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Retrieval bookkeeping. */
    chunkCount: { type: Number, default: 0 },
    embeddingStatus: { type: String, enum: ['pending', 'ready', 'failed', 'skipped'], default: 'pending' },
    embeddedAt: { type: Date, default: null },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

knowledgeItemSchema.index({ productId: 1, active: 1, category: 1 });
knowledgeItemSchema.index({ title: 'text', content: 'text', keywords: 'text', tags: 'text' });

module.exports = mongoose.model('KnowledgeItem', knowledgeItemSchema);
