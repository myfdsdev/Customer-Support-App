'use strict';

const mongoose = require('mongoose');

/**
 * Who changed what, for the actions where "we don't know" is not an acceptable
 * answer: integration settings, product-id mappings, CSV imports, event
 * reprocessing and manual entitlement changes.
 *
 * Append-only. Nothing in application code updates or deletes a row.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },

    /** Dotted action name, e.g. 'jvzoo.event.reprocess', 'product.mapping.update'. */
    action: { type: String, required: true, index: true },
    /** What was acted on: 'product', 'payment_event', 'customer_product'... */
    targetType: { type: String, default: '' },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    /** Human-readable summary shown in the admin log. */
    summary: { type: String, default: '' },
    /** Structured detail. Must never contain secrets. */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    ipHash: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

/** Fire-and-forget: an audit write must never fail the action it describes. */
auditLogSchema.statics.record = function record(payload) {
  return this.create(payload).catch(() => null);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
