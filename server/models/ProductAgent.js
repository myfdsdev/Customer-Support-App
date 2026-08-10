'use strict';

const mongoose = require('mongoose');

const productAgentSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isLead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productAgentSchema.index({ productId: 1, agentId: 1 }, { unique: true });

module.exports = mongoose.model('ProductAgent', productAgentSchema);
