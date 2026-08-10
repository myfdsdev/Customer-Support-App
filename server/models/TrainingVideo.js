'use strict';

const mongoose = require('mongoose');
const { KNOWLEDGE_CATEGORIES } = require('../utils/constants');

const trainingVideoSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 250 },
    description: { type: String, default: '', maxlength: 4000 },

    /** The product capability this video teaches, e.g. "Custom Agent". */
    feature: { type: String, default: '', trim: true, index: true },
    category: { type: String, enum: [...KNOWLEDGE_CATEGORIES, 'Tutorial'], default: 'Tutorial', index: true },

    keywords: { type: [String], default: [], index: true },
    /** Real phrasings customers use — the strongest matching signal we have. */
    questionVariations: { type: [String], default: [] },

    videoUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: '' },
    duration: { type: Number, default: 0 }, // seconds

    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },

    embedding: { type: [Number], default: [] },
    embeddingModel: { type: String, default: '' },

    recommendedCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

trainingVideoSchema.index({ productId: 1, active: 1, sortOrder: 1 });
trainingVideoSchema.index({ title: 'text', description: 'text', keywords: 'text', questionVariations: 'text', feature: 'text' });

module.exports = mongoose.model('TrainingVideo', trainingVideoSchema);
