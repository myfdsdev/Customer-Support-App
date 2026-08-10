'use strict';

const mongoose = require('mongoose');
const {
  TICKET_STATUS,
  TICKET_STATUS_LIST,
  TICKET_CATEGORIES,
  TEAMS,
  PRIORITY,
  PRIORITY_LIST,
} = require('../utils/constants');

const Counter = require('./Counter');

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null, index: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 10000 },
    category: { type: String, enum: TICKET_CATEGORIES, default: 'Other', index: true },
    priority: { type: String, enum: PRIORITY_LIST, default: PRIORITY.NORMAL, index: true },
    status: { type: String, enum: TICKET_STATUS_LIST, default: TICKET_STATUS.OPEN, index: true },

    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedTeam: { type: String, enum: [...TEAMS, ''], default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    attachments: {
      type: [
        {
          _id: false,
          url: String,
          name: String,
          type: String,
          size: Number,
        },
      ],
      default: [],
    },
    notes: {
      type: [
        {
          agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          agentName: String,
          note: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    resolution: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ productId: 1, status: 1, createdAt: -1 });

ticketSchema.pre('validate', async function assignNumber(next) {
  if (this.ticketNumber) return next();
  try {
    const seq = await Counter.next('ticket');
    this.ticketNumber = `TKT-${String(seq).padStart(5, '0')}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
