'use strict';

const mongoose = require('mongoose');

const customerNoteSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    agentName: { type: String, default: '' },
    note: { type: String, required: true, maxlength: 5000 },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

customerNoteSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerNote', customerNoteSchema);
