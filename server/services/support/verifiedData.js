'use strict';

const { CustomerProduct } = require('../../models');

/**
 * The ONLY source of account/billing facts the AI is allowed to state.
 *
 * If a payment provider is wired up later, it plugs in here. Until then an
 * unverified record contributes nothing, which forces the answer layer to
 * escalate transactional questions to the Billing Team instead of guessing.
 */
async function getVerifiedAccountData({ customerId, productId }) {
  if (!customerId || !productId) return {};

  const link = await CustomerProduct.findOne({ customerId, productId }).lean();
  if (!link || !link.verified) return {};

  const data = {};
  if (link.plan) data.plan = link.plan;
  if (link.subscriptionStatus && link.subscriptionStatus !== 'none') data.subscriptionStatus = link.subscriptionStatus;
  if (link.orderId) data.orderId = link.orderId;
  if (link.purchaseDate) data.purchaseDate = new Date(link.purchaseDate).toISOString().slice(0, 10);
  if (typeof link.credits === 'number') data.credits = link.credits;
  if (link.lastVerifiedAt) data.lastVerifiedAt = new Date(link.lastVerifiedAt).toISOString();
  if (link.verifiedSource) data.source = link.verifiedSource;

  return data;
}

/** True when we hold nothing verified and must route the question to a human. */
function hasVerifiedData(data) {
  return Boolean(data && Object.keys(data).length);
}

module.exports = { getVerifiedAccountData, hasVerifiedData };
